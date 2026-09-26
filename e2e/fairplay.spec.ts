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
  await page.getByRole("button", { name: "VENT 20 SEK" }).click();
  await expect(page.getByText("VENTER · 00:20")).toBeVisible();
  await expect(page.locator(".live-page")).not.toHaveClass(/live-page--due/);
  await page.getByRole("button", { name: "VIS BYTTET NÅ" }).click();
  await expect(page.getByText("BYTT NÅ")).toBeVisible();
  await page.getByRole("button", { name: "BYTTET ER GJORT" }).click();

  const projection = page.locator(".projection-summary");
  await expect(projection).toContainText("Lucas prioriteres senere");
  await expect(projection).toContainText("Se detaljer");
  await projection.click();
  const projectionDialog = page.getByRole("dialog", {
    name: "Prognose etter kampen",
  });
  await expect(projectionDialog).toBeVisible();
  await expect(projectionDialog).toContainText("Forskjeller innen ±00:30");
  await expect(
    projectionDialog.locator(".list-row").filter({ hasText: "Lucas" }),
  ).toContainText("−0:27");
  await projectionDialog.getByRole("button", { name: "Lukk" }).click();
  await page.clock.fastForward(513_000);
  await page.getByRole("button", { name: "AVSLUTT KAMP" }).click();
  await expect(page.locator("time", { hasText: "03:27" })).toBeVisible();
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

test("wait quiets an overdue alert and reminds again", async ({ page }) => {
  await openWithClock(page);
  await startFirstSeedMatch(page);
  await page.clock.fastForward(180_000);

  await page.getByRole("button", { name: "VENT 20 SEK" }).click();
  await expect(page.getByText("VENTER · 00:20")).toBeVisible();
  await expect(page.locator(".live-page")).not.toHaveClass(/live-page--due/);
  await page.clock.fastForward(20_000);
  await expect(page.getByText("BYTT NÅ")).toBeVisible();
  await expect(page.getByRole("button", { name: "VENT 20 SEK" })).toBeVisible();
});

test("manual deviation changes the real lineup and audited undo restores it", async ({
  page,
}) => {
  await openWithClock(page);
  await startFirstSeedMatch(page);
  await page.clock.fastForward(60_000);

  await page.getByRole("button", { name: "Bytt ut Fredrik H" }).click();
  const dialog = page.getByRole("dialog", { name: "Manuelt bytte" });
  await expect(dialog.getByText("Hva trenger barnet?")).toHaveCount(0);
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
  await holdOutDialog.getByRole("checkbox", { name: /Barnet trenger pause/ }).check();
  await holdOutDialog.getByRole("button", { name: "Mistet motivasjonen" }).click();
  await holdOutDialog.getByRole("button", { name: "REGISTRER BYTTE" }).click();
  await expect(
    page.locator(".paused-player").filter({ hasText: "Fredrik H" }),
  ).toContainText("Mistet motivasjonen");
  await expect(
    page
      .locator(".paused-player")
      .filter({ hasText: "Fredrik H" })
      .getByRole("button", { name: "Klar igjen" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Flere valg" }).click();
  const actions = page.getByRole("dialog", { name: "Kampvalg" });
  await expect(
    actions.getByRole("button", { name: /Fredrik H\s+Ikke tilgjengelig/ }),
  ).toBeVisible();
  await actions.getByRole("button", { name: "Angre siste byttehandling" }).click();
  await expect(
    page.locator(".live-player--field").filter({ hasText: "Fredrik H" }),
  ).toBeVisible();
});

test("an injury pause carries through the next match without creating catch-up target", async ({
  page,
}) => {
  await openWithClock(page);
  await startFirstSeedMatch(page);
  await page.clock.fastForward(60_000);

  await page.getByRole("button", { name: "Bytt ut Fredrik H" }).click();
  const dialog = page.getByRole("dialog", { name: "Manuelt bytte" });
  await dialog.getByRole("checkbox", { name: /Barnet trenger pause/ }).check();
  await dialog
    .getByLabel("Hvor lenge?")
    .selectOption({ label: "Denne kampen + neste kamp" });
  await expect(dialog.getByLabel("Eksisterende avvik")).toHaveValue("preserve");
  await dialog.getByRole("button", { name: "REGISTRER BYTTE" }).click();
  const paused = page.locator(".paused-player").filter({ hasText: "Fredrik H" });
  await paused.getByRole("button", { name: "Klar igjen" }).click();
  await expect(
    page.locator(".live-player--bench").filter({ hasText: "Fredrik H" }),
  ).toBeVisible();
  await page.clock.fastForward(660_000);
  await page.getByRole("button", { name: "AVSLUTT KAMP" }).click();
  await page.getByRole("button", { name: "Neste kamp" }).click();

  const fredrik = page.locator(".availability-toggle").filter({ hasText: "Fredrik H" });
  await expect(fredrik).toContainText("Deltakelsespause");
  await expect(page.getByText("3 tilgjengelige")).toBeVisible();
  await expect(page.getByText("3 av 3 valgt")).toBeVisible();
});

test("a resting player remains visible and returns with one tap", async ({ page }) => {
  await openWithClock(page);
  await startFirstSeedMatch(page);

  await page.getByRole("button", { name: "Bytt ut Fredrik H" }).click();
  const dialog = page.getByRole("dialog", { name: "Manuelt bytte" });
  await dialog.getByRole("checkbox", { name: /Barnet trenger pause/ }).check();
  await dialog.getByRole("button", { name: "REGISTRER BYTTE" }).click();

  const paused = page.locator(".paused-player").filter({ hasText: "Fredrik H" });
  await expect(paused).toContainText("Trenger pause");
  await paused.getByRole("button", { name: "Klar igjen" }).click();
  await expect(
    page.locator(".live-player--bench").filter({ hasText: "Fredrik H" }),
  ).toBeVisible();
});

test("the coach can waive pre-injury balance instead of carrying it forward", async ({
  page,
}) => {
  await openWithClock(page);
  await startFirstSeedMatch(page);
  await page.clock.fastForward(60_000);

  await page.getByRole("button", { name: "Bytt ut Ask" }).click();
  const dialog = page.getByRole("dialog", { name: "Manuelt bytte" });
  await dialog.getByRole("checkbox", { name: /Barnet trenger pause/ }).check();
  await dialog.getByLabel("Eksisterende avvik").selectOption("waive");
  await dialog.getByRole("button", { name: "REGISTRER BYTTE" }).click();
  await page.clock.fastForward(660_000);
  await page.getByRole("button", { name: "AVSLUTT KAMP" }).click();
  await page.getByRole("button", { name: "Neste kamp" }).click();

  const ask = page.locator(".availability-toggle").filter({ hasText: "Ask" });
  await expect(ask).toContainText("avvik ±0:00");
  await expect(ask).toContainText("Tilgjengelig");
});

test("summary correction restores an injury pause and future availability", async ({
  page,
}) => {
  await openWithClock(page);
  await startFirstSeedMatch(page);
  await page.clock.fastForward(60_000);

  await page.getByRole("button", { name: "Bytt ut Fredrik H" }).click();
  const dialog = page.getByRole("dialog", { name: "Manuelt bytte" });
  await dialog.getByRole("checkbox", { name: /Barnet trenger pause/ }).check();
  await dialog
    .getByLabel("Hvor lenge?")
    .selectOption({ label: "Denne kampen + neste kamp" });
  await dialog.getByRole("button", { name: "REGISTRER BYTTE" }).click();
  await page.clock.fastForward(660_000);
  await page.getByRole("button", { name: "AVSLUTT KAMP" }).click();
  await page.getByRole("button", { name: "Rett opp siste bytte" }).click();
  await expect(
    page.getByText("Siste bytte er markert som angret i hendelsesloggen."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Neste kamp" }).click();

  const fredrik = page.locator(".availability-toggle").filter({ hasText: "Fredrik H" });
  await expect(fredrik).toContainText("Tilgjengelig");
  await expect(page.getByText("4 tilgjengelige")).toBeVisible();
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

test("loads the Storm BLÅ match day from the home screen", async ({ page }) => {
  await openWithClock(page);
  await page.getByRole("button", { name: "Last inn Storm BLÅ" }).click();

  await expect(page.getByRole("heading", { name: "Storm BLÅ" })).toBeVisible();
  await expect(page.getByText("5 lagspillere")).toBeVisible();
  await expect(page.getByText("11:30 · Bane 1 · 12:00")).toBeVisible();
  await expect(page.getByText("mot TUIL Blå")).toBeVisible();
  await page.getByRole("button", { name: /Kamper\s+0 av 4 ferdige/ }).click();
  for (const opponent of [
    "TUIL Blå",
    "Ulfstind Rød",
    "Reinen IL Blå",
    "Reinen IL Hvit",
  ]) {
    await expect(page.getByText(`mot ${opponent}`)).toBeVisible();
  }
});

test("loads Krokelvdalen 3 with a fixed two-minute rhythm", async ({ page }) => {
  await openWithClock(page);
  await page.getByRole("button", { name: "Last inn Krokelvdalen 3" }).click();

  await expect(page.getByRole("heading", { name: "Krokelvdalen 3" })).toBeVisible();
  await expect(page.getByText("10:30 · 12:00")).toBeVisible();
  await expect(page.getByText("mot Reinen 2")).toBeVisible();
  await page.getByRole("button", { name: "GJØR KLAR KAMP" }).click();
  const plan = page.locator(".substitution-plan");
  for (const time of ["02:00", "04:00", "06:00", "08:00", "10:00"]) {
    await expect(plan.getByText(time, { exact: true })).toBeVisible();
  }
  const allocation = page.locator(".interval-allocation");
  await expect(allocation.locator("span")).toHaveCount(5);
  await expect(allocation.getByText(/Ask 4 · 08:00/)).toBeVisible();
  await expect(allocation.getByText(/Kasper 3 · 06:00/)).toBeVisible();
  await page.getByRole("button", { name: "START KAMP" }).click();
  await expect(page.getByText("Neste bytte om 02:00")).toBeVisible();
  await page.clock.fastForward(145_000);
  await expect(
    page.getByText("+00:25 · Ta byttet når spillet tillater det"),
  ).toBeVisible();
  await expect(
    page.getByText(/Deretter 04:00 · Fredrik inn \/ Henrik ut/),
  ).toBeVisible();
  await page.getByRole("button", { name: "BYTTET ER GJORT" }).click();
  await expect(page.getByText("Neste bytte om 01:35")).toBeVisible();
  await expect(page.getByText(/Fredrik\s+INN/i)).toBeVisible();
  await expect(page.getByText(/Henrik\s+UT/i)).toBeVisible();
  await page.reload();
  await expect(page.getByText("Neste bytte om 01:35")).toBeVisible();
  await expect(page.getByText(/Fredrik\s+INN/i)).toBeVisible();
  await expect(page.getByText(/Henrik\s+UT/i)).toBeVisible();
});

test("the planned incoming child replacing someone else takes the planned slot", async ({
  page,
}) => {
  await openWithClock(page);
  await page.getByRole("button", { name: "Last inn Krokelvdalen 3" }).click();
  await page.getByRole("button", { name: "GJØR KLAR KAMP" }).click();
  await page.getByRole("button", { name: "START KAMP" }).click();
  await expect(page.getByText("Neste bytte om 02:00")).toBeVisible();
  await expect(page.getByText(/Kasper\s+INN/i)).toBeVisible();
  await page.clock.fastForward(100_000);

  await page.getByRole("button", { name: "Bytt ut Kai" }).click();
  const dialog = page.getByRole("dialog", { name: "Manuelt bytte" });
  await expect(dialog.locator(".manual-summary")).toContainText("Kasper inn");
  await expect(dialog.getByText("Teller som det planlagte byttet")).toBeVisible();
  await dialog.getByRole("button", { name: "REGISTRER BYTTE" }).click();

  await expect(
    page.locator(".live-player--bench").filter({ hasText: "Kai" }),
  ).toBeVisible();
  await expect(page.getByText("Neste bytte om 02:20")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Neste bytte om 02:20")).toBeVisible();
});

test("overrides the fixed rhythm for one match", async ({ page }) => {
  await openWithClock(page);
  await page.getByRole("button", { name: "Last inn Krokelvdalen 3" }).click();
  await page.getByRole("button", { name: /Kamper\s+0 av 4 ferdige/ }).click();
  const firstMatch = page.locator(".card").filter({ hasText: "mot Reinen 2" }).first();
  await firstMatch.getByRole("button", { name: "Rediger" }).click();
  const dialog = page.getByRole("dialog", { name: "Rediger kamp" });
  await dialog
    .getByLabel("Bytterytme")
    .selectOption({ label: "Adaptiv rettferdig rytme" });
  await dialog.getByRole("button", { name: "Lagre kamp" }).click();
  await expect(firstMatch).toContainText("Adaptiv rettferdig rytme");
  await firstMatch.locator(".match-row__open").click();
  await expect(page.getByText(/Adaptiv rettferdig rytme/)).toBeVisible();
  await page.getByRole("button", { name: "START KAMP" }).click();
  await expect(page.getByText("Neste bytte om 02:24")).toBeVisible();
});

test("a 5-a-side formation keeps the keeper and gives incoming children a position", async ({
  page,
}) => {
  await openWithClock(page);
  await page.getByRole("button", { name: "Ny spilldag" }).first().click();
  await page.getByLabel("Navn på spilldagen").fill("5er-cup");
  await page.getByLabel("Lag").fill("Femmern");
  await page.getByLabel("Kamplengde (minutter)").fill("12");
  await page.getByLabel("Bytterytme").selectOption({ label: "Hvert 02:00" });
  await page.getByRole("radio", { name: "5er" }).check();
  await page.getByLabel("Formasjon").selectOption({ label: "5er · 1-2-1 (diamant)" });
  await page.getByRole("button", { name: "Fortsett til spillere" }).click();

  for (const name of ["Ada", "Bo", "Cy", "Di", "Eli", "Fin", "Gus"]) {
    await page.getByPlaceholder("Spillernavn").fill(name);
    await page.getByRole("button", { name: "Legg til", exact: true }).click();
    await expect(
      page.locator(".list-row__title").getByText(name, { exact: true }),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: "Fortsett til kamper" }).click();
  await page.getByRole("button", { name: "Legg til kamp" }).click();
  await page.getByLabel("Motstander").fill("Reinen");
  await page.getByRole("button", { name: "Lagre kamp" }).click();
  const matchRow = page.locator(".card").filter({ hasText: "mot Reinen" }).first();
  await expect(matchRow).toContainText("5er · 1-2-1 (diamant)");
  await matchRow.locator(".match-row__open").click();

  const pitch = page.getByRole("group", { name: "Posisjoner på banen" });
  await expect(pitch.locator(".pitch__slot")).toHaveCount(5);
  await expect(pitch.getByRole("button", { name: "Keeper: Ada" })).toBeVisible();
  await expect(page.getByText(/Ada står i mål hele kampen\./)).toBeVisible();
  await expect(page.getByRole("button", { name: "Benk: Fin" })).toBeVisible();

  await page.getByRole("button", { name: "START KAMP" }).click();
  await expect(page.getByText("Neste bytte om 02:00")).toBeVisible();
  await page.clock.fastForward(120_000);
  await expect(page.getByText("BYTT NÅ")).toBeVisible();
  const livePitch = page.getByRole("group", { name: "På banen" });
  await expect(livePitch.locator(".pitch__slot")).toHaveCount(5);
  await expect(livePitch.locator(".pitch__incoming")).toContainText(/Fin/);
  const layout = await page.evaluate(() => ({
    viewportHeight: window.innerHeight,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  expect(layout.scrollHeight).toBeLessThanOrEqual(layout.viewportHeight);
  await page.getByRole("button", { name: "BYTTET ER GJORT" }).click();

  const pwaStatus = page.locator(".pwa-status");
  if (await pwaStatus.isVisible()) {
    await pwaStatus.getByRole("button", { name: "Lukk" }).click();
  }
  await page.getByRole("button", { name: "Flere valg" }).click();
  await page.getByRole("button", { name: "Bytt posisjoner" }).click();
  const dialog = page.getByRole("dialog", { name: "Bytt posisjoner" });
  await dialog.getByRole("button", { name: "Keeper: Ada" }).click();
  await dialog.getByRole("button", { name: /^Spiss: / }).click();
  await expect(dialog.getByRole("button", { name: "Spiss: Ada" })).toBeVisible();
  await dialog.getByRole("button", { name: "LAGRE POSISJONER" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Bytt ut Ada (Spiss)" })).toBeVisible();
});
