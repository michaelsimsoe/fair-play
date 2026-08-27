import { expect, test, type Page } from "@playwright/test";

const START_TIME = new Date("2026-08-22T09:00:00.000Z");

async function openWithClock(page: Page) {
  await page.clock.install({ time: START_TIME });
  await page.clock.pauseAt(START_TIME);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "FairPlay" })).toBeVisible();
}

async function loadSeed(page: Page) {
  await page.getByRole("button", { name: "Last inn eksempel" }).click();
  await expect(page.getByRole("heading", { name: "Krokelvdalen 2" })).toBeVisible();
}

async function startFirstSeedMatch(page: Page) {
  await loadSeed(page);
  await page.getByRole("button", { name: "GJØR KLAR KAMP" }).click();
  await expect(page.getByRole("heading", { name: "mot Reinen Hvit" })).toBeVisible();
  await expect(page.getByText("3 av 3 valgt")).toBeVisible();
  await page.getByRole("button", { name: "START KAMP" }).click();
  await expect(page.getByText("Neste bytte om 03:00")).toBeVisible();
}

test("seed match follows the exact three-minute rotation", async ({ page }) => {
  await openWithClock(page);
  await startFirstSeedMatch(page);
  const layout = await page.evaluate(() => ({
    viewportHeight: window.innerHeight,
    scrollHeight: document.documentElement.scrollHeight,
    primaryActionsBottom:
      document.querySelector(".live-actions")?.getBoundingClientRect().bottom ??
      Number.POSITIVE_INFINITY,
  }));
  expect(layout.scrollHeight).toBeLessThanOrEqual(layout.viewportHeight);
  expect(layout.primaryActionsBottom).toBeLessThanOrEqual(layout.viewportHeight);

  await page.clock.fastForward(170_000);
  await expect(page.getByText("GJØR KLAR · 00:10")).toBeVisible();
  await expect(page.locator(".live-page")).toHaveClass(/live-page--prepare/);
  await page.clock.fastForward(10_000);
  await expect(page.getByText("BYTT NÅ")).toBeVisible();
  await expect(page.locator(".live-page")).not.toHaveClass(/live-page--prepare/);
  await expect(page.getByText(/Lucas\s+INN/i)).toBeVisible();
  await expect(page.getByText(/Ask\s+UT/i)).toBeVisible();
  await page.getByRole("button", { name: "BYTTET ER GJORT" }).click();

  await expect(page.getByText("Neste bytte om 03:00")).toBeVisible();
  await page.clock.fastForward(180_000);
  await page.getByRole("button", { name: "BYTTET ER GJORT" }).click();
  await page.clock.fastForward(180_000);
  await page.getByRole("button", { name: "BYTTET ER GJORT" }).click();
  await page.clock.fastForward(180_000);

  await expect(page.getByText("KAMPEN ER FERDIG")).toBeVisible();
  await page.getByRole("button", { name: "AVSLUTT KAMP" }).click();
  await expect(page.getByRole("heading", { name: "mot Reinen Hvit" })).toBeVisible();

  for (const player of ["Ask", "Ali", "Fredrik H", "Lucas"]) {
    const row = page.locator(".summary-player").filter({ hasText: player }).first();
    await expect(row.getByText("09:00", { exact: true }).first()).toBeVisible();
  }
  await expect(
    page.locator(".event-log time").getByText("03:00", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Lucas inn · Ask ut/)).toBeVisible();
  await expect(page.getByText(/Ask inn · Ali ut/)).toBeVisible();
  await expect(page.getByText(/Ali inn · Fredrik H ut/)).toBeVisible();
});

test("a delayed confirmation records reality and reports the remaining imbalance", async ({
  page,
}) => {
  await openWithClock(page);
  await startFirstSeedMatch(page);

  await page.clock.fastForward(207_000);
  await expect(
    page.getByText("+00:27 · Ta byttet når spillet tillater det"),
  ).toBeVisible();
  await page.getByRole("button", { name: "BYTTET ER GJORT" }).click();

  const projection = page.locator(".projection-summary");
  await expect(projection).toContainText("Lucas");
  await expect(projection).toContainText("−0:27");
  await expect(projection).toContainText("Innenfor ±00:30");
  await projection.click();
  await expect(
    page.getByRole("dialog", { name: "Prognose etter kampen" }),
  ).toBeVisible();
  await page
    .getByRole("dialog", { name: "Prognose etter kampen" })
    .getByRole("button", { name: "Lukk" })
    .click();
  await page.clock.fastForward(513_000);
  await page.getByRole("button", { name: "AVSLUTT KAMP" }).click();
  await expect(page.getByText("03:27")).toBeVisible();
  await expect(page.getByText(/Lucas inn · Ask ut/)).toBeVisible();
});

test("reload and pause recovery preserve active elapsed time and lineup", async ({
  page,
}) => {
  await openWithClock(page);
  await startFirstSeedMatch(page);

  await page.clock.fastForward(90_000);
  await expect(page.getByText("10:30")).toBeVisible();
  await page.reload();
  await expect(page.getByText("10:30")).toBeVisible();
  await expect(page.getByText("Ask").first()).toBeVisible();

  await page
    .getByRole("button", { name: "Pause", exact: true })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  await expect(
    page.getByRole("button", { name: "Fortsett", exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(60_000);
  await expect(page.getByText("10:30")).toBeVisible();
  await page.reload();
  await expect(page.getByText("10:30")).toBeVisible();
  await page.getByRole("button", { name: "Fortsett", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await page.clock.fastForward(30_000);
  await expect(page.getByText("10:00")).toBeVisible();
});

test("manual deviation changes the real lineup and audited undo restores it", async ({
  page,
}) => {
  await openWithClock(page);
  await startFirstSeedMatch(page);
  await page.clock.fastForward(60_000);

  await page.getByRole("button", { name: "Bytt ut Fredrik H" }).click();
  const dialog = page.getByRole("dialog", { name: "Manuelt bytte" });
  await dialog.getByRole("button", { name: "REGISTRER BYTTE" }).click();

  await expect(
    page.locator(".live-player--field").filter({ hasText: "Lucas" }),
  ).toBeVisible();
  await expect(
    page.locator(".live-player--bench").filter({ hasText: "Fredrik H" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Flere valg" }).click();
  await page.getByRole("button", { name: "Angre siste byttehandling" }).click();
  await expect(
    page.locator(".live-player--field").filter({ hasText: "Fredrik H" }),
  ).toBeVisible();
  await expect(
    page.locator(".live-player--bench").filter({ hasText: "Lucas" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Bytt ut Fredrik H" }).click();
  const holdOutDialog = page.getByRole("dialog", { name: "Manuelt bytte" });
  await holdOutDialog.getByRole("checkbox", { name: /Hold spilleren ute/ }).check();
  await holdOutDialog.getByRole("button", { name: "REGISTRER BYTTE" }).click();
  await expect(
    page.locator(".live-player").filter({ hasText: "Fredrik H" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Flere valg" }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Kampvalg" })
      .getByRole("button", { name: /Fredrik H\s+Ikke tilgjengelig/ }),
  ).toBeVisible();
});

test("the cached app shell and local tournament work offline", async ({
  page,
  context,
}) => {
  const remoteRuntimeRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith("http") && url.origin !== "http://127.0.0.1:4173") {
      remoteRuntimeRequests.push(request.url());
    }
  });
  await openWithClock(page);
  await loadSeed(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Krokelvdalen 2" })).toBeVisible();
  await page.getByRole("button", { name: "GJØR KLAR KAMP" }).click();
  await page.getByRole("button", { name: "START KAMP" }).click();
  await expect(page.getByText("Neste bytte om 03:00")).toBeVisible();
  expect(remoteRuntimeRequests).toEqual([]);
});

test("a reusable guest shares the match target without team carry", async ({
  page,
}) => {
  await openWithClock(page);
  await loadSeed(page);
  await page.getByRole("button", { name: "GJØR KLAR KAMP" }).click();
  await page.getByLabel("Navn på gjestespiller").fill("Maria");
  await page.getByRole("button", { name: "Legg til gjest" }).click();
  await expect(page.getByText("1 med i kampen")).toBeVisible();
  await page.getByRole("button", { name: "START KAMP" }).click();
  await expect(page.getByText("Neste bytte om 02:24")).toBeVisible();

  for (let change = 0; change < 4; change += 1) {
    await page.clock.fastForward(144_000);
    await page.getByRole("button", { name: "BYTTET ER GJORT" }).click();
  }
  await page.clock.fastForward(144_000);
  await page.getByRole("button", { name: "AVSLUTT KAMP" }).click();

  for (const player of ["Ask", "Ali", "Fredrik H", "Lucas", "Maria"]) {
    const row = page.locator(".summary-player").filter({ hasText: player }).first();
    await expect(row.getByText("07:12", { exact: true }).first()).toBeVisible();
  }
  await expect(
    page.locator(".summary-player").filter({ hasText: "Maria · Gjest" }),
  ).toContainText("teller bare i denne kampen");
  await page.getByRole("button", { name: "Tilbake" }).click();
  await page.getByRole("button", { name: /Oppsummering\s+Hele spilldagen/ }).click();
  await expect(
    page.locator(".summary-players .summary-player").filter({ hasText: "Maria" }),
  ).toHaveCount(0);
  await expect(page.getByText(/Gjestespillere.*teller ikke her/)).toBeVisible();
});
