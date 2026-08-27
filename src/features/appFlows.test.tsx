import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServicesProvider, type AppServices } from "../app/services";
import { AudioCue } from "../platform/audioCue";
import { WakeLockController } from "../platform/wakeLock";
import { FairPlayDatabase } from "../storage/db";
import { FairPlayRepository } from "../storage/repository";
import { MatchesPage } from "./matches/MatchesPage";
import { PreMatchPage } from "./preMatch/PreMatchPage";
import { RosterPage } from "./roster/RosterPage";
import { CreateTournamentPage } from "./tournament/CreateTournamentPage";

let database: FairPlayDatabase;
let repository: FairPlayRepository;
let services: AppServices;

beforeEach(async () => {
  database = new FairPlayDatabase(`fairplay-ui-${crypto.randomUUID()}`);
  repository = new FairPlayRepository(database);
  await repository.initialize();
  const audio = new AudioCue();
  const wakeLock = new WakeLockController();
  vi.spyOn(audio, "initialize").mockResolvedValue("ready");
  vi.spyOn(wakeLock, "request").mockResolvedValue();
  services = { repository, audio, wakeLock };
  window.location.hash = "#/";
});

afterEach(async () => {
  cleanup();
  database.close();
  await database.delete();
});

function renderPage(page: React.ReactNode) {
  return render(<ServicesProvider services={services}>{page}</ServicesProvider>);
}

describe("primary setup flow", () => {
  it("creates a tournament, roster and match, then records the real start event", async () => {
    const user = userEvent.setup();
    const create = renderPage(<CreateTournamentPage />);
    await user.clear(screen.getByLabelText("Lag"));
    await user.type(screen.getByLabelText("Lag"), "Krokelvdalen 2");
    await user.click(screen.getByRole("button", { name: "Fortsett til spillere" }));

    await waitFor(async () => {
      expect(await database.tournaments.count()).toBe(1);
    });
    const tournament = (await database.tournaments.toArray())[0]!;
    create.unmount();

    const roster = renderPage(<RosterPage tournamentId={tournament.id} />);
    for (const [index, name] of ["Ask", "Ali", "Fredrik H", "Lucas"].entries()) {
      const input = await screen.findByLabelText("Spillernavn");
      await waitFor(() => expect(input).toBeEnabled());
      await user.type(input, name);
      await user.click(screen.getByRole("button", { name: "Legg til" }));
      await waitFor(async () => {
        expect(await database.players.count()).toBe(index + 1);
      });
      await screen.findByText(name);
    }
    expect(await database.players.count()).toBe(4);
    roster.unmount();

    const matches = renderPage(<MatchesPage tournamentId={tournament.id} />);
    await user.click(await screen.findByRole("button", { name: "Ny kamp" }));
    await user.type(screen.getByLabelText("Motstander"), "Reinen Hvit");
    await user.type(screen.getByLabelText("Bane"), "2");
    await user.click(screen.getByRole("button", { name: "Lagre kamp" }));
    await screen.findByText("mot Reinen Hvit");
    const match = (await database.matches.toArray())[0]!;
    matches.unmount();

    renderPage(<PreMatchPage matchId={match.id} />);
    expect(await screen.findByText("3 av 3 valgt")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "START KAMP" }));

    await waitFor(async () => {
      expect((await repository.getMatch(match.id))?.status).toBe("running");
    });
    const events = await repository.getMatchEvents(match.id);
    expect(events).toHaveLength(1);
    const startEvent = events[0];
    expect(startEvent?.type).toBe("MATCH_STARTED");
    expect(startEvent?.elapsedMs).toBe(0);
    if (startEvent?.type !== "MATCH_STARTED") {
      throw new Error("Expected MATCH_STARTED");
    }
    expect(startEvent.payload.starterLineupIds).toHaveLength(3);
    expect(
      startEvent.payload.starterLineupIds.every(
        (playerId) => typeof playerId === "string",
      ),
    ).toBe(true);
    expect((await repository.getJournal(match.id))?.clockStatus).toBe("running");
  });

  it("adds a reusable guest during pre-match and includes them only in that match", async () => {
    const user = userEvent.setup();
    const tournament = await repository.createTournament({
      name: "Spilldag",
      date: "2026-08-27",
      timezone: "Europe/Oslo",
      teamName: "Testlaget",
      defaultMatchDurationMs: 720_000,
      defaultPlayersOnField: 3,
      defaultMinimumStintMs: 60_000,
      defaultAlertLeadMs: 10_000,
      fairnessScope: "tournament",
    });
    await Promise.all(
      ["Ask", "Ali", "Lucas"].map((name) => repository.addPlayer(tournament.id, name)),
    );
    const match = await repository.addMatch(tournament, {
      opponent: "Reinen",
    });

    renderPage(<PreMatchPage matchId={match.id} />);
    await user.type(await screen.findByLabelText("Navn på gjestespiller"), "Maria");
    await user.click(screen.getByRole("button", { name: "Legg til gjest" }));
    await screen.findByText("1 med i kampen");
    await user.click(screen.getByRole("button", { name: "START KAMP" }));

    await waitFor(async () => {
      expect((await repository.getMatch(match.id))?.status).toBe("running");
    });
    const guest = (await database.players.toArray()).find(
      (player) => player.name === "Maria",
    );
    const startedMatch = await repository.getMatch(match.id);
    const startEvent = (await repository.getMatchEvents(match.id))[0];
    expect(guest?.membership).toBe("guest");
    expect(startedMatch?.eligiblePlayerIds).toContain(guest?.id);
    if (startEvent?.type !== "MATCH_STARTED") {
      throw new Error("Expected MATCH_STARTED");
    }
    expect(startEvent.payload.availablePlayerIds).toContain(guest?.id);
  });
});
