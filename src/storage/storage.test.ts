import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import seed from "../../public/seed/seed-krokelvdalen-2.json";
import stormSeed from "../../public/seed/seed-storm-bla-2026-09-12.json";
import { projectMatch } from "../domain";
import { calculateTournamentTotals } from "../features/shared/data";
import {
  exportBackup,
  importBackup,
  importSeed,
  ImportValidationError,
} from "./backup";
import { FairPlayDatabase } from "./db";
import { FairPlayRepository } from "./repository";
import { toDomainConfiguration, toDomainEvents } from "./domainAdapter";
import type { ActiveMatchJournalRecord, MatchEventRecord, MatchRecord } from "./schema";

let database: FairPlayDatabase;
let repository: FairPlayRepository;

beforeEach(async () => {
  database = new FairPlayDatabase(`fairplay-test-${crypto.randomUUID()}`);
  repository = new FairPlayRepository(database);
  await repository.initialize();
});

afterEach(async () => {
  database.close();
  await database.delete();
});

const tournamentInput = {
  name: "Testcup",
  date: "2026-08-22",
  timezone: "Europe/Oslo",
  teamName: "Testlaget",
  defaultMatchDurationMs: 720_000,
  defaultPlayersOnField: 3,
  defaultMinimumStintMs: 60_000,
  defaultAlertLeadMs: 10_000,
  fairnessScope: "tournament" as const,
};

describe("FairPlayRepository", () => {
  it("creates and reads a tournament with ordered players and matches", async () => {
    const tournament = await repository.createTournament(tournamentInput);
    await repository.addPlayer(tournament.id, "Ask");
    await repository.addPlayer(tournament.id, "Ali");
    await repository.addMatch(tournament, {
      opponent: "Reinen",
      scheduledStartLocal: "2026-08-22T11:00",
    });

    const loaded = await repository.getTournamentBundle(tournament.id);

    expect(loaded?.tournament.teamName).toBe("Testlaget");
    expect(loaded?.players.map((player) => player.name)).toEqual(["Ask", "Ali"]);
    expect(loaded?.matches[0]?.opponent).toBe("Reinen");
  });

  it("rejects duplicate normalized player names", async () => {
    const tournament = await repository.createTournament(tournamentInput);
    await repository.addPlayer(tournament.id, "Fredrik H");

    await expect(repository.addPlayer(tournament.id, "  FREDRIK   H ")).rejects.toThrow(
      /finnes allerede/,
    );
  });

  it("keeps reusable guests out of new matches until selected", async () => {
    const tournament = await repository.createTournament(tournamentInput);
    const teamPlayer = await repository.addPlayer(tournament.id, "Ask");
    const guest = await repository.addPlayer(tournament.id, "Maria", "guest");

    const match = await repository.addMatch(tournament, {});

    expect(teamPlayer.membership).toBe("team");
    expect(guest.membership).toBe("guest");
    expect(match.eligiblePlayerIds).toEqual([teamPlayer.id]);
  });

  it("updates unstarted participation but locks membership after match history", async () => {
    const tournament = await repository.createTournament(tournamentInput);
    const player = await repository.addPlayer(tournament.id, "Ask");
    const match = await repository.addMatch(tournament, {});

    await repository.updatePlayer({ ...player, membership: "guest" });
    expect((await repository.getMatch(match.id))?.eligiblePlayerIds).not.toContain(
      player.id,
    );
    await repository.updatePlayer({ ...player, membership: "team" });
    expect((await repository.getMatch(match.id))?.eligiblePlayerIds).toContain(
      player.id,
    );
    await repository.updateMatch({ ...match, status: "running" });

    await expect(
      repository.updatePlayer({ ...player, membership: "guest" }),
    ).rejects.toThrow(/etter at en kamp har startet/);
  });

  it("propagates semantic future pauses to matches added later", async () => {
    const tournament = await repository.createTournament(tournamentInput);
    const player = await repository.addPlayer(tournament.id, "Ask");
    const origin = await repository.addMatch(tournament, {
      opponent: "Origin",
    });
    const pauseId = crypto.randomUUID();
    await repository.updatePlayer({
      ...player,
      participationPauses: [
        {
          id: pauseId,
          originMatchId: origin.id,
          scope: "rest-day",
          matchIds: [origin.id],
          balanceTreatment: "preserve",
          availabilityActive: true,
          compensationActive: true,
        },
      ],
      unavailableMatchIds: [origin.id],
    });
    const pausedPlayer = await database.players.get(player.id);
    if (!pausedPlayer) throw new Error("Missing paused player");
    await repository.updatePlayer({ ...pausedPlayer, active: false });

    const match = await repository.addMatch(tournament, {
      opponent: "Late addition",
    });

    const archived = await database.players.get(player.id);
    if (!archived) throw new Error("Missing archived player");
    await repository.updatePlayer({ ...archived, active: true });
    const updated = await database.players.get(player.id);
    expect(updated?.unavailableMatchIds).toContain(match.id);
    expect(updated?.participationPauses[0]?.matchIds).toEqual([origin.id, match.id]);
  });

  it("uses a pending next-match pause exactly once", async () => {
    const tournament = await repository.createTournament(tournamentInput);
    const player = await repository.addPlayer(tournament.id, "Ask");
    const origin = await repository.addMatch(tournament, {
      opponent: "Origin",
    });
    const pauseId = crypto.randomUUID();
    await repository.updatePlayer({
      ...player,
      participationPauses: [
        {
          id: pauseId,
          originMatchId: origin.id,
          scope: "through-next",
          matchIds: [origin.id],
          balanceTreatment: "preserve",
          availabilityActive: true,
          compensationActive: true,
        },
      ],
      unavailableMatchIds: [origin.id],
    });

    const next = await repository.addMatch(tournament, { opponent: "Next" });
    const later = await repository.addMatch(tournament, { opponent: "Later" });

    const updated = await database.players.get(player.id);
    expect(updated?.unavailableMatchIds).toContain(next.id);
    expect(updated?.unavailableMatchIds).not.toContain(later.id);
    expect(updated?.participationPauses[0]?.matchIds).toEqual([origin.id, next.id]);

    await repository.reorderMatches(tournament.id, [origin.id, later.id, next.id]);
    const reordered = await database.players.get(player.id);
    expect(reordered?.participationPauses[0]?.matchIds).toEqual([origin.id, later.id]);
    expect(reordered?.unavailableMatchIds).not.toContain(next.id);

    await repository.deleteUnstartedMatch(later.id);
    const afterDelete = await database.players.get(player.id);
    expect(afterDelete?.participationPauses[0]?.matchIds).toEqual([origin.id, next.id]);

    await repository.updateMatch({ ...next, status: "completed" });
    const afterCompletedNext = await repository.addMatch(tournament, {
      opponent: "After completed next",
    });
    const expired = await database.players.get(player.id);
    expect(expired?.unavailableMatchIds).not.toContain(afterCompletedNext.id);
    expect(expired?.participationPauses[0]?.matchIds).toEqual([]);
  });

  it("resetting an injured match restores pause and waiver metadata", async () => {
    const tournament = await repository.createTournament(tournamentInput);
    const player = await repository.addPlayer(tournament.id, "Ask");
    const match = await repository.addMatch(tournament, {});
    const laterMatch = await repository.addMatch(tournament, {});
    const adjustmentId = crypto.randomUUID();
    const pauseId = crypto.randomUUID();
    const laterPauseId = crypto.randomUUID();
    const pauseEvent: MatchEventRecord = {
      id: pauseId,
      matchId: match.id,
      sequence: 1,
      type: "PLAYER_AVAILABILITY_CHANGED",
      elapsedMs: 60_000,
      recordedAtWallMs: 60_001,
      source: "user",
      schemaVersion: 1,
      payload: {
        playerId: player.id,
        previousAvailable: true,
        available: false,
        pauseScope: "rest-day",
        balanceTreatment: "waive",
        previousUnavailableMatchIds: [],
        pausedMatchIds: [match.id],
        participationPauseId: pauseId,
        fairnessAdjustmentId: adjustmentId,
      },
    };
    await database.matchEvents.add(pauseEvent);
    await database.matches.put({ ...match, status: "completed" });
    await database.players.put({
      ...player,
      unavailableMatchIds: [match.id, laterMatch.id],
      participationPauses: [
        {
          id: pauseId,
          originMatchId: match.id,
          scope: "rest-day",
          matchIds: [match.id],
          balanceTreatment: "waive",
          availabilityActive: true,
          compensationActive: false,
        },
        {
          id: laterPauseId,
          originMatchId: laterMatch.id,
          scope: "current",
          matchIds: [laterMatch.id],
          balanceTreatment: "preserve",
          availabilityActive: true,
          compensationActive: true,
        },
      ],
      fairnessAdjustments: [
        {
          id: adjustmentId,
          matchId: match.id,
          elapsedMs: 60_000,
          amountMs: 15_000,
          recordedAtWallMs: 60_001,
          reason: "Waived",
        },
      ],
    });

    await repository.resetMatch(match.id);

    const restored = await database.players.get(player.id);
    expect(restored?.unavailableMatchIds).toEqual([laterMatch.id]);
    expect(restored?.participationPauses).toEqual([
      {
        id: laterPauseId,
        originMatchId: laterMatch.id,
        scope: "current",
        matchIds: [laterMatch.id],
        balanceTreatment: "preserve",
        availabilityActive: true,
        compensationActive: true,
      },
    ]);
    expect(restored?.fairnessAdjustments).toEqual([]);
    expect(await repository.getMatchEvents(match.id)).toEqual([]);
  });

  it("resetting a match reapplies pauses originating in an earlier match", async () => {
    const tournament = await repository.createTournament(tournamentInput);
    const player = await repository.addPlayer(tournament.id, "Ask");
    const origin = await repository.addMatch(tournament, {});
    const resetCandidate = await repository.addMatch(tournament, {});
    await repository.updateMatch({ ...origin, status: "completed" });
    await repository.updateMatch({
      ...resetCandidate,
      status: "completed",
    });
    await repository.updatePlayer({
      ...player,
      participationPauses: [
        {
          id: crypto.randomUUID(),
          originMatchId: origin.id,
          scope: "rest-day",
          matchIds: [],
          balanceTreatment: "preserve",
          availabilityActive: true,
          compensationActive: true,
        },
      ],
    });

    await repository.resetMatch(resetCandidate.id);

    const restored = await database.players.get(player.id);
    expect(restored?.unavailableMatchIds).toContain(resetCandidate.id);
    expect(restored?.participationPauses[0]?.matchIds).toContain(resetCandidate.id);
  });

  it("commits event, match status, and recovery journal atomically", async () => {
    const tournament = await repository.createTournament(tournamentInput);
    const match = await repository.addMatch(tournament, {});
    const started: MatchRecord = { ...match, status: "running" };
    const event: MatchEventRecord = {
      id: crypto.randomUUID(),
      matchId: match.id,
      sequence: 0,
      type: "MATCH_STARTED",
      elapsedMs: 0,
      recordedAtWallMs: 1_000,
      source: "user",
      schemaVersion: 1,
      payload: {
        starterLineupIds: ["a", "b", "c"],
        availablePlayerIds: ["a", "b", "c", "d"],
        plannedDurationMs: 720_000,
        playersOnField: 3,
      },
    };
    const journal: ActiveMatchJournalRecord = {
      matchId: match.id,
      clockStatus: "running",
      elapsedAtSnapshotMs: 0,
      snapshotWallMs: 1_000,
      lastResumeWallMs: 1_000,
      plannedDurationMs: 720_000,
      currentLineupIds: ["a", "b", "c"],
      lastEventSequence: 0,
      savedAtWallMs: 1_000,
    };

    await repository.commitMatchAction(event, started, journal);

    expect((await repository.getMatch(match.id))?.status).toBe("running");
    expect(await repository.getMatchEvents(match.id)).toEqual([event]);
    expect(await repository.getJournal(match.id)).toEqual(journal);
  });

  it("rolls back all writes when an atomic action conflicts", async () => {
    const tournament = await repository.createTournament(tournamentInput);
    const player = await repository.addPlayer(tournament.id, "Ask");
    const match = await repository.addMatch(tournament, {});
    const event: MatchEventRecord = {
      id: crypto.randomUUID(),
      matchId: match.id,
      sequence: 0,
      type: "MATCH_PAUSED",
      elapsedMs: 1_000,
      recordedAtWallMs: 2_000,
      source: "user",
      schemaVersion: 1,
      payload: {},
    };
    await database.matchEvents.add(event);

    await expect(
      repository.commitMatchAction(event, { ...match, status: "paused" }, undefined, [
        { ...player, unavailableMatchIds: [match.id] },
      ]),
    ).rejects.toThrow();

    expect((await repository.getMatch(match.id))?.status).toBe("scheduled");
    expect(await repository.getMatchEvents(match.id)).toHaveLength(1);
    expect((await database.players.get(player.id))?.unavailableMatchIds).toEqual([]);
  });

  it("applies an explicit fairness waiver without rewriting actual or ideal time", async () => {
    const tournament = await repository.createTournament(tournamentInput);
    const players = await Promise.all(
      ["Ask", "Ali", "Fredrik", "Lucas"].map((name) =>
        repository.addPlayer(tournament.id, name),
      ),
    );
    const match = await repository.addMatch(tournament, {});
    const ask = players[0]!;
    const events: MatchEventRecord[] = [
      {
        id: crypto.randomUUID(),
        matchId: match.id,
        sequence: 0,
        type: "MATCH_STARTED",
        elapsedMs: 0,
        recordedAtWallMs: 1,
        source: "user",
        schemaVersion: 1,
        payload: {
          starterLineupIds: players.slice(0, 3).map(({ id }) => id),
          availablePlayerIds: players.map(({ id }) => id),
        },
      },
      {
        id: crypto.randomUUID(),
        matchId: match.id,
        sequence: 1,
        type: "MATCH_ENDED",
        elapsedMs: 120_000,
        recordedAtWallMs: 120_001,
        source: "user",
        schemaVersion: 1,
        payload: {},
      },
    ];
    await database.matchEvents.bulkAdd(events);
    await database.matches.put({ ...match, status: "completed" });
    await database.players.put({
      ...ask,
      fairnessAdjustments: [
        {
          id: crypto.randomUUID(),
          matchId: match.id,
          elapsedMs: 60_000,
          amountMs: -30_000,
          recordedAtWallMs: 60_001,
          reason: "Test waiver",
        },
      ],
    });
    const bundle = await repository.getTournamentBundle(tournament.id);
    if (!bundle) throw new Error("Missing tournament");

    const totals = await calculateTournamentTotals(repository, bundle);

    expect(totals[ask.id]).toEqual({
      actualMs: 120_000,
      idealMs: 90_000,
      balanceMs: 0,
    });
  });
});

describe("backup and import", () => {
  it("round trips a full backup into a clean database", async () => {
    const tournament = await repository.createTournament(tournamentInput);
    const players = await Promise.all(
      ["Ask", "Ali", "Fredrik H", "Lucas"].map((name) =>
        repository.addPlayer(tournament.id, name),
      ),
    );
    const match = await repository.addMatch(tournament, { opponent: "TUIL" });
    const events: MatchEventRecord[] = [
      {
        id: crypto.randomUUID(),
        matchId: match.id,
        sequence: 0,
        type: "MATCH_STARTED",
        elapsedMs: 0,
        recordedAtWallMs: 1,
        source: "user",
        schemaVersion: 1,
        payload: {
          starterLineupIds: players.slice(0, 3).map(({ id }) => id),
          availablePlayerIds: players.map(({ id }) => id),
          plannedDurationMs: match.plannedDurationMs,
          playersOnField: match.playersOnField,
        },
      },
      {
        id: crypto.randomUUID(),
        matchId: match.id,
        sequence: 1,
        type: "MATCH_ENDED",
        elapsedMs: 120_000,
        recordedAtWallMs: 120_001,
        source: "user",
        schemaVersion: 1,
        payload: { reason: "test" },
      },
    ];
    await database.matchEvents.bulkAdd(events);
    await database.matches.put({ ...match, status: "completed" });
    const projectionBefore = projectMatch(
      toDomainConfiguration(match),
      toDomainEvents(events),
    );
    const backup = await exportBackup(database);
    const target = new FairPlayDatabase(`fairplay-target-${crypto.randomUUID()}`);
    await target.open();

    try {
      const importedIds = await importBackup(backup, "restore", target);
      const importedMatch = (await target.matches.toArray())[0]!;
      const importedEvents = await target.matchEvents.toArray();
      const projectionAfter = projectMatch(
        toDomainConfiguration(importedMatch),
        toDomainEvents(importedEvents),
      );
      expect(importedIds).toEqual([tournament.id]);
      expect(await target.players.count()).toBe(4);
      expect(await target.matches.count()).toBe(1);
      expect(projectionAfter.actualMsByPlayer).toEqual(
        projectionBefore.actualMsByPlayer,
      );
      expect(projectionAfter.idealMsByPlayer).toEqual(projectionBefore.idealMsByPlayer);
      expect(
        (await target.players.toArray()).every(
          (player) => player.membership === "team",
        ),
      ).toBe(true);
    } finally {
      target.close();
      await target.delete();
    }
  });

  it("imports a backup as an independently remapped copy", async () => {
    const tournament = await repository.createTournament(tournamentInput);
    const player = await repository.addPlayer(tournament.id, "Ask");
    const match = await repository.addMatch(tournament, {});
    const backup = await exportBackup(database);

    const [copiedId] = await importBackup(backup, "copy", database);
    const copiedTournament = await database.tournaments.get(copiedId!);
    const copiedPlayers = await database.players
      .where("tournamentId")
      .equals(copiedId!)
      .toArray();
    const copiedMatches = await database.matches
      .where("tournamentId")
      .equals(copiedId!)
      .toArray();

    expect(copiedId).not.toBe(tournament.id);
    expect(copiedTournament?.name).toBe("Testcup (kopi)");
    expect(copiedPlayers[0]?.id).not.toBe(player.id);
    expect(copiedMatches[0]?.id).not.toBe(match.id);
    expect(copiedMatches[0]?.eligiblePlayerIds).toEqual([copiedPlayers[0]?.id]);
    expect(copiedMatches[0]?.eligiblePlayerIds).not.toContain(player.id);
  });

  it("rejects invalid imports without partial writes", async () => {
    const before = await database.tournaments.count();

    await expect(
      importBackup('{"format":"fairplay-sideline-backup"}', "restore", database),
    ).rejects.toBeInstanceOf(ImportValidationError);

    expect(await database.tournaments.count()).toBe(before);
  });

  it("migrates legacy v1 backups to team-player membership", async () => {
    const tournament = await repository.createTournament(tournamentInput);
    await repository.addPlayer(tournament.id, "Ask");
    const current = JSON.parse(await exportBackup(database)) as {
      schemaVersion: number;
      data: { players: Array<Record<string, unknown>> };
    };
    current.schemaVersion = 1;
    for (const player of current.data.players) {
      delete player.membership;
      delete player.explicitUnavailableMatchIds;
      delete player.unavailableMatchIds;
      delete player.participationPauses;
      delete player.fairnessAdjustments;
    }
    const target = new FairPlayDatabase(`fairplay-legacy-${crypto.randomUUID()}`);
    await target.open();

    try {
      await importBackup(JSON.stringify(current), "restore", target);
      const imported = (await target.players.toArray())[0];
      expect(imported?.membership).toBe("team");
      expect(imported?.explicitUnavailableMatchIds).toEqual([]);
      expect(imported?.unavailableMatchIds).toEqual([]);
      expect(imported?.participationPauses).toEqual([]);
      expect(imported?.fairnessAdjustments).toEqual([]);
    } finally {
      target.close();
      await target.delete();
    }
  });

  it("migrates v2 backups to participation-pause fields", async () => {
    const tournament = await repository.createTournament(tournamentInput);
    await repository.addPlayer(tournament.id, "Ask");
    const current = JSON.parse(await exportBackup(database)) as {
      schemaVersion: number;
      data: { players: Array<Record<string, unknown>> };
    };
    current.schemaVersion = 2;
    for (const player of current.data.players) {
      delete player.explicitUnavailableMatchIds;
      delete player.unavailableMatchIds;
      delete player.participationPauses;
      delete player.fairnessAdjustments;
    }
    const target = new FairPlayDatabase(`fairplay-v2-${crypto.randomUUID()}`);
    await target.open();

    try {
      await importBackup(JSON.stringify(current), "restore", target);
      const imported = (await target.players.toArray())[0];
      expect(imported?.membership).toBe("team");
      expect(imported?.explicitUnavailableMatchIds).toEqual([]);
      expect(imported?.unavailableMatchIds).toEqual([]);
      expect(imported?.participationPauses).toEqual([]);
      expect(imported?.fairnessAdjustments).toEqual([]);
    } finally {
      target.close();
      await target.delete();
    }
  });

  it("validates and imports the bundled seed through the public schema", async () => {
    const tournamentId = await importSeed(JSON.stringify(seed), database);
    const bundle = await repository.getTournamentBundle(tournamentId);

    expect(bundle?.tournament.teamName).toBe("Krokelvdalen 2");
    expect(bundle?.players.map((player) => player.name)).toEqual([
      "Ask",
      "Ali",
      "Fredrik H",
      "Lucas",
    ]);
    expect(bundle?.players.every((player) => player.membership === "team")).toBe(true);
    expect(bundle?.matches).toHaveLength(4);
    expect(bundle?.matches[0]).toMatchObject({
      plannedDurationMs: 720_000,
      playersOnField: 3,
      status: "ready",
    });
  });

  it("imports the Storm BLÅ match day from the supplied schedule", async () => {
    const tournamentId = await importSeed(JSON.stringify(stormSeed), database);
    const bundle = await repository.getTournamentBundle(tournamentId);

    expect(bundle?.tournament).toMatchObject({
      name: "Spilldag – Kroken 12. september 2026",
      date: "2026-09-12",
      teamName: "Storm BLÅ",
      defaultPlayersOnField: 3,
      defaultMatchDurationMs: 720_000,
    });
    expect(bundle?.players.map((player) => player.name)).toEqual([
      "Ask",
      "Ali",
      "Kai",
      "Fredrik",
      "Martin",
    ]);
    expect(
      bundle?.matches.map(({ scheduledStartLocal, opponent, pitch }) => ({
        scheduledStartLocal,
        opponent,
        pitch,
      })),
    ).toEqual([
      {
        scheduledStartLocal: "2026-09-12T11:30:00",
        opponent: "TUIL Blå",
        pitch: "1",
      },
      {
        scheduledStartLocal: "2026-09-12T12:00:00",
        opponent: "Ulfstind Rød",
        pitch: "1",
      },
      {
        scheduledStartLocal: "2026-09-12T12:45:00",
        opponent: "Reinen IL Blå",
        pitch: "1",
      },
      {
        scheduledStartLocal: "2026-09-12T13:15:00",
        opponent: "Reinen IL Hvit",
        pitch: "1",
      },
    ]);
  });
});

describe("schema migration", () => {
  it("normalizes legacy player names during the v2 migration", async () => {
    const name = `fairplay-migration-${crypto.randomUUID()}`;
    const legacy = new Dexie(name);
    legacy.version(1).stores({
      tournaments: "id, date, updatedAtWallMs",
      players: "id, tournamentId, [tournamentId+sortOrder]",
      matches: "id, tournamentId, [tournamentId+order], status, updatedAtWallMs",
      matchEvents: "id, matchId, [matchId+sequence]",
      activeMatchJournals: "matchId, savedAtWallMs",
      appSettings: "id",
    });
    await legacy.open();
    await legacy.table("players").add({
      id: "p1",
      tournamentId: "t1",
      name: "  ASK  ",
      sortOrder: 0,
      active: true,
      createdAtWallMs: 1,
    });
    legacy.close();

    const migrated = new FairPlayDatabase(name);
    try {
      await migrated.open();
      expect((await migrated.players.get("p1"))?.normalizedName).toBe("ask");
      expect((await migrated.players.get("p1"))?.membership).toBe("team");
      expect((await migrated.players.get("p1"))?.unavailableMatchIds).toEqual([]);
      expect((await migrated.players.get("p1"))?.explicitUnavailableMatchIds).toEqual(
        [],
      );
      expect((await migrated.players.get("p1"))?.participationPauses).toEqual([]);
      expect((await migrated.players.get("p1"))?.fairnessAdjustments).toEqual([]);
    } finally {
      migrated.close();
      await migrated.delete();
    }
  });
});
