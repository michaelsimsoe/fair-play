import type { Transaction } from "dexie";
import { db as defaultDatabase } from "./db";
import type { FairPlayDatabase } from "./db";
import {
  activeMatchJournalSchema,
  defaultSettings,
  matchEventSchema,
  matchSchema,
  normalizePlayerName,
  type ActiveMatchJournalRecord,
  type AppSettingsRecord,
  type MatchEventRecord,
  type MatchRecord,
  type PlayerRecord,
  type TournamentRecord,
} from "./schema";

export type TournamentBundle = {
  tournament: TournamentRecord;
  players: PlayerRecord[];
  matches: MatchRecord[];
};

export type CreateTournamentInput = {
  name: string;
  date: string;
  timezone: string;
  teamName: string;
  coachLabel?: string;
  defaultMatchDurationMs: number;
  defaultPlayersOnField: number;
  defaultMinimumStintMs: number;
  defaultAlertLeadMs: number;
  fairnessScope: "tournament" | "match";
};

export class FairPlayRepository {
  constructor(private readonly database: FairPlayDatabase = defaultDatabase) {}

  async initialize(): Promise<void> {
    await this.database.open();
    if (!(await this.database.appSettings.get("settings"))) {
      await this.database.appSettings.put(defaultSettings(Date.now()));
    }
  }

  async listTournaments(): Promise<TournamentRecord[]> {
    return this.database.tournaments
      .filter((tournament) => tournament.archivedAtWallMs === undefined)
      .reverse()
      .sortBy("updatedAtWallMs");
  }

  async getTournamentBundle(
    tournamentId: string,
  ): Promise<TournamentBundle | undefined> {
    const [tournament, players, matches] = await Promise.all([
      this.database.tournaments.get(tournamentId),
      this.database.players
        .where("tournamentId")
        .equals(tournamentId)
        .sortBy("sortOrder"),
      this.database.matches.where("tournamentId").equals(tournamentId).sortBy("order"),
    ]);
    if (!tournament) return undefined;
    return { tournament, players, matches };
  }

  async createTournament(input: CreateTournamentInput): Promise<TournamentRecord> {
    const now = Date.now();
    const tournament: TournamentRecord = {
      id: crypto.randomUUID(),
      ...input,
      createdAtWallMs: now,
      updatedAtWallMs: now,
    };
    await this.database.transaction(
      "rw",
      [this.database.tournaments, this.database.appSettings],
      async () => {
        await this.database.tournaments.add(tournament);
        const settings =
          (await this.database.appSettings.get("settings")) ?? defaultSettings(now);
        await this.database.appSettings.put({
          ...settings,
          lastTournamentId: tournament.id,
          updatedAtWallMs: now,
        });
      },
    );
    return tournament;
  }

  async updateTournament(tournament: TournamentRecord): Promise<void> {
    await this.database.tournaments.put({
      ...tournament,
      updatedAtWallMs: Date.now(),
    });
  }

  async archiveTournament(tournamentId: string): Promise<void> {
    const tournament = await this.database.tournaments.get(tournamentId);
    if (!tournament) throw new Error("Spilldagen finnes ikke.");
    const now = Date.now();
    await this.database.tournaments.put({
      ...tournament,
      archivedAtWallMs: now,
      updatedAtWallMs: now,
    });
  }

  async addPlayer(
    tournamentId: string,
    name: string,
    membership: PlayerRecord["membership"] = "team",
  ): Promise<PlayerRecord> {
    const normalizedName = normalizePlayerName(name);
    if (!normalizedName) throw new Error("Spillernavn kan ikke være tomt.");
    const players = await this.database.players
      .where("tournamentId")
      .equals(tournamentId)
      .toArray();
    if (players.some((player) => player.normalizedName === normalizedName)) {
      throw new Error("En spiller med dette navnet finnes allerede.");
    }

    const player: PlayerRecord = {
      id: crypto.randomUUID(),
      tournamentId,
      name: name.trim(),
      normalizedName,
      sortOrder: players.length,
      active: true,
      membership,
      createdAtWallMs: Date.now(),
    };
    await this.database.players.add(player);
    await this.touchTournament(tournamentId);
    return player;
  }

  async updatePlayer(player: PlayerRecord): Promise<void> {
    const normalizedName = normalizePlayerName(player.name);
    const existing = await this.database.players.get(player.id);
    if (!existing) throw new Error("Spilleren finnes ikke.");
    const duplicate = await this.database.players
      .where("tournamentId")
      .equals(player.tournamentId)
      .filter(
        (candidate) =>
          candidate.id !== player.id && candidate.normalizedName === normalizedName,
      )
      .first();
    if (duplicate) throw new Error("En spiller med dette navnet finnes allerede.");
    const membershipChanged = existing.membership !== player.membership;
    const matches = membershipChanged
      ? await this.database.matches
          .where("tournamentId")
          .equals(player.tournamentId)
          .toArray()
      : [];
    if (
      membershipChanged &&
      matches.some((match) => match.status !== "scheduled" && match.status !== "ready")
    ) {
      throw new Error("Spillertype kan ikke endres etter at en kamp har startet.");
    }
    const updatedMatches = matches.map((match) => {
      const eligible = new Set(match.eligiblePlayerIds);
      if (player.membership === "team") eligible.add(player.id);
      else eligible.delete(player.id);
      const updated: MatchRecord = {
        ...match,
        eligiblePlayerIds: [...eligible],
        updatedAtWallMs: Date.now(),
      };
      if (
        player.membership === "guest" &&
        updated.selectedStarterIds?.includes(player.id)
      ) {
        updated.selectedStarterIds = updated.selectedStarterIds.filter(
          (id) => id !== player.id,
        );
      }
      return updated;
    });
    await this.database.transaction(
      "rw",
      [this.database.players, this.database.matches, this.database.tournaments],
      async () => {
        await this.database.players.put({ ...player, normalizedName });
        if (updatedMatches.length > 0) {
          await this.database.matches.bulkPut(updatedMatches);
        }
        await this.touchTournament(player.tournamentId);
      },
    );
  }

  async reorderPlayers(tournamentId: string, orderedIds: string[]): Promise<void> {
    const players = await this.database.players
      .where("tournamentId")
      .equals(tournamentId)
      .toArray();
    const byId = new Map(players.map((player) => [player.id, player]));
    const ordered = orderedIds.map((id, index) => {
      const player = byId.get(id);
      if (!player) throw new Error("Kunne ikke endre spillerrekkefølgen.");
      return { ...player, sortOrder: index };
    });
    await this.database.transaction(
      "rw",
      [this.database.players, this.database.tournaments],
      async () => {
        await this.database.players.bulkPut(ordered);
        await this.touchTournament(tournamentId);
      },
    );
  }

  async removePlayer(playerId: string): Promise<void> {
    const player = await this.database.players.get(playerId);
    if (!player) return;
    const matches = await this.database.matches
      .where("tournamentId")
      .equals(player.tournamentId)
      .toArray();
    const referenced = matches.some(
      (match) =>
        match.eligiblePlayerIds.includes(playerId) ||
        match.selectedStarterIds?.includes(playerId),
    );
    if (referenced) {
      await this.updatePlayer({
        ...player,
        active: false,
        archivedAtWallMs: Date.now(),
      });
      return;
    }
    await this.database.players.delete(playerId);
    await this.touchTournament(player.tournamentId);
  }

  async addMatch(
    tournament: TournamentRecord,
    values: {
      scheduledStartLocal?: string;
      opponent?: string;
      pitch?: string;
      notes?: string;
      plannedDurationMs?: number;
      playersOnField?: number;
    },
  ): Promise<MatchRecord> {
    const matches = await this.database.matches
      .where("tournamentId")
      .equals(tournament.id)
      .toArray();
    const players = await this.database.players
      .where("tournamentId")
      .equals(tournament.id)
      .filter((player) => player.active && player.membership === "team")
      .toArray();
    const now = Date.now();
    const match: MatchRecord = {
      id: crypto.randomUUID(),
      tournamentId: tournament.id,
      order: matches.length,
      plannedDurationMs: values.plannedDurationMs ?? tournament.defaultMatchDurationMs,
      playersOnField: values.playersOnField ?? tournament.defaultPlayersOnField,
      minimumStintMs: tournament.defaultMinimumStintMs,
      alertLeadMs: tournament.defaultAlertLeadMs,
      eligiblePlayerIds: players.map((player) => player.id),
      status: "scheduled",
      createdAtWallMs: now,
      updatedAtWallMs: now,
      ...(values.scheduledStartLocal
        ? { scheduledStartLocal: values.scheduledStartLocal }
        : {}),
      ...(values.opponent ? { opponent: values.opponent } : {}),
      ...(values.pitch ? { pitch: values.pitch } : {}),
      ...(values.notes ? { notes: values.notes } : {}),
    };
    await this.database.matches.add(match);
    await this.touchTournament(tournament.id);
    return match;
  }

  async updateMatch(match: MatchRecord): Promise<void> {
    await this.database.matches.put({ ...match, updatedAtWallMs: Date.now() });
    await this.touchTournament(match.tournamentId);
  }

  async duplicateMatch(matchId: string): Promise<MatchRecord> {
    const match = await this.database.matches.get(matchId);
    if (!match) throw new Error("Kampen finnes ikke.");
    const matches = await this.database.matches
      .where("tournamentId")
      .equals(match.tournamentId)
      .toArray();
    const now = Date.now();
    const duplicate: MatchRecord = {
      ...match,
      id: crypto.randomUUID(),
      order: matches.length,
      status: "scheduled",
      createdAtWallMs: now,
      updatedAtWallMs: now,
    };
    delete duplicate.selectedStarterIds;
    await this.database.matches.add(duplicate);
    await this.touchTournament(match.tournamentId);
    return duplicate;
  }

  async reorderMatches(
    tournamentId: string,
    orderedIds: readonly string[],
  ): Promise<void> {
    const matches = await this.database.matches
      .where("tournamentId")
      .equals(tournamentId)
      .toArray();
    const byId = new Map(matches.map((match) => [match.id, match]));
    const ordered = orderedIds.map((id, index) => {
      const match = byId.get(id);
      if (!match) throw new Error("Kunne ikke endre kamprekkefølgen.");
      return { ...match, order: index, updatedAtWallMs: Date.now() };
    });
    if (ordered.length !== matches.length) {
      throw new Error("Alle kampene må være med i rekkefølgen.");
    }
    await this.database.transaction(
      "rw",
      [this.database.matches, this.database.tournaments],
      async () => {
        await this.database.matches.bulkPut(ordered);
        await this.touchTournament(tournamentId);
      },
    );
  }

  async deleteUnstartedMatch(matchId: string): Promise<void> {
    const match = await this.database.matches.get(matchId);
    if (!match) return;
    if (match.status !== "scheduled" && match.status !== "ready") {
      throw new Error("En startet kamp må nullstilles før den kan slettes.");
    }
    await this.database.matches.delete(matchId);
    await this.touchTournament(match.tournamentId);
  }

  async resetMatch(matchId: string): Promise<void> {
    const match = await this.database.matches.get(matchId);
    if (!match) throw new Error("Kampen finnes ikke.");
    const reset: MatchRecord = {
      ...match,
      status: "scheduled",
      updatedAtWallMs: Date.now(),
    };
    delete reset.selectedStarterIds;
    await this.database.transaction(
      "rw",
      [
        this.database.matches,
        this.database.matchEvents,
        this.database.activeMatchJournals,
        this.database.tournaments,
      ],
      async () => {
        await this.database.matchEvents.where("matchId").equals(matchId).delete();
        await this.database.activeMatchJournals.delete(matchId);
        await this.database.matches.put(reset);
        await this.touchTournament(match.tournamentId);
      },
    );
  }

  async getMatch(matchId: string): Promise<MatchRecord | undefined> {
    return this.database.matches.get(matchId);
  }

  async getMatchEvents(matchId: string): Promise<MatchEventRecord[]> {
    return this.database.matchEvents
      .where("matchId")
      .equals(matchId)
      .sortBy("sequence");
  }

  async getNextSequence(matchId: string): Promise<number> {
    const last = await this.database.matchEvents
      .where("matchId")
      .equals(matchId)
      .last();
    return (last?.sequence ?? -1) + 1;
  }

  async commitMatchAction(
    eventOrEvents: MatchEventRecord | readonly MatchEventRecord[],
    match: MatchRecord,
    journal?: ActiveMatchJournalRecord,
  ): Promise<void> {
    const events: MatchEventRecord[] =
      "type" in eventOrEvents ? [eventOrEvents] : [...eventOrEvents];
    if (events.length === 0) throw new Error("Ingen hendelser å lagre.");
    const validatedEvents = events.map((event) => matchEventSchema.parse(event));
    const validatedMatch = matchSchema.parse(match);
    const validatedJournal = journal
      ? activeMatchJournalSchema.parse(journal)
      : undefined;
    await this.database.transaction(
      "rw",
      [
        this.database.matchEvents,
        this.database.matches,
        this.database.activeMatchJournals,
        this.database.tournaments,
      ],
      async () => {
        for (const event of validatedEvents) {
          const existingSequence = await this.database.matchEvents
            .where("[matchId+sequence]")
            .equals([event.matchId, event.sequence])
            .first();
          if (existingSequence) {
            throw new Error("Kampen ble endret et annet sted. Last inn på nytt.");
          }
        }
        await this.database.matchEvents.bulkAdd(validatedEvents);
        await this.database.matches.put({
          ...validatedMatch,
          updatedAtWallMs: Date.now(),
        });
        if (validatedJournal) {
          await this.database.activeMatchJournals.put(validatedJournal);
        } else {
          await this.database.activeMatchJournals.delete(validatedMatch.id);
        }
        await this.touchTournament(validatedMatch.tournamentId);
      },
    );
  }

  async saveJournal(journal: ActiveMatchJournalRecord): Promise<void> {
    await this.database.activeMatchJournals.put(
      activeMatchJournalSchema.parse(journal),
    );
  }

  async getJournal(matchId: string): Promise<ActiveMatchJournalRecord | undefined> {
    return this.database.activeMatchJournals.get(matchId);
  }

  async getActiveJournals(): Promise<ActiveMatchJournalRecord[]> {
    return this.database.activeMatchJournals.toArray();
  }

  async clearJournal(matchId: string): Promise<void> {
    await this.database.activeMatchJournals.delete(matchId);
  }

  async getSettings(): Promise<AppSettingsRecord> {
    return (
      (await this.database.appSettings.get("settings")) ?? defaultSettings(Date.now())
    );
  }

  async saveSettings(settings: AppSettingsRecord): Promise<void> {
    await this.database.appSettings.put({
      ...settings,
      updatedAtWallMs: Date.now(),
    });
  }

  async clearAll(): Promise<void> {
    await this.database.transaction(
      "rw",
      [
        this.database.tournaments,
        this.database.players,
        this.database.matches,
        this.database.matchEvents,
        this.database.activeMatchJournals,
        this.database.appSettings,
      ],
      async () => {
        await Promise.all([
          this.database.tournaments.clear(),
          this.database.players.clear(),
          this.database.matches.clear(),
          this.database.matchEvents.clear(),
          this.database.activeMatchJournals.clear(),
          this.database.appSettings.clear(),
        ]);
        await this.database.appSettings.add(defaultSettings(Date.now()));
      },
    );
  }

  getDatabase(): FairPlayDatabase {
    return this.database;
  }

  private async touchTournament(tournamentId: string): Promise<void> {
    await this.database.tournaments.update(tournamentId, {
      updatedAtWallMs: Date.now(),
    });
  }
}

export async function runInTransaction(
  transaction: Transaction,
  action: () => Promise<void>,
): Promise<void> {
  if (transaction.mode !== "readwrite") {
    throw new Error("En skrivetransaksjon er påkrevd.");
  }
  await action();
}

export const repository = new FairPlayRepository();
