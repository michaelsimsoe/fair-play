import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import seed from "../../public/seed/seed-krokelvdalen-2.json";
import stormSeed from "../../public/seed/seed-storm-bla-2026-09-12.json";
import { projectMatch } from "../domain";
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
      repository.commitMatchAction(event, { ...match, status: "paused" }),
    ).rejects.toThrow();

    expect((await repository.getMatch(match.id))?.status).toBe("scheduled");
    expect(await repository.getMatchEvents(match.id)).toHaveLength(1);
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
    for (const player of current.data.players) delete player.membership;
    const target = new FairPlayDatabase(`fairplay-legacy-${crypto.randomUUID()}`);
    await target.open();

    try {
      await importBackup(JSON.stringify(current), "restore", target);
      expect((await target.players.toArray())[0]?.membership).toBe("team");
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
    } finally {
      migrated.close();
      await migrated.delete();
    }
  });
});
