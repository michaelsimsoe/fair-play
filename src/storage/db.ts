import Dexie, { type EntityTable } from "dexie";
import {
  defaultSettings,
  normalizePlayerName,
  type ActiveMatchJournalRecord,
  type AppSettingsRecord,
  type MatchEventRecord,
  type MatchRecord,
  type PlayerRecord,
  type TournamentRecord,
} from "./schema";

export class FairPlayDatabase extends Dexie {
  tournaments!: EntityTable<TournamentRecord, "id">;
  players!: EntityTable<PlayerRecord, "id">;
  matches!: EntityTable<MatchRecord, "id">;
  matchEvents!: EntityTable<MatchEventRecord, "id">;
  activeMatchJournals!: EntityTable<ActiveMatchJournalRecord, "matchId">;
  appSettings!: EntityTable<AppSettingsRecord, "id">;

  constructor(name = "fairplay-sideline") {
    super(name);

    this.version(1).stores({
      tournaments: "id, date, updatedAtWallMs",
      players: "id, tournamentId, [tournamentId+sortOrder]",
      matches: "id, tournamentId, [tournamentId+order], status, updatedAtWallMs",
      matchEvents: "id, matchId, [matchId+sequence]",
      activeMatchJournals: "matchId, savedAtWallMs",
      appSettings: "id",
    });

    this.version(2)
      .stores({
        tournaments: "id, date, updatedAtWallMs",
        players: "id, tournamentId, [tournamentId+sortOrder], normalizedName",
        matches: "id, tournamentId, [tournamentId+order], status, updatedAtWallMs",
        matchEvents: "id, matchId, [matchId+sequence]",
        activeMatchJournals: "matchId, savedAtWallMs",
        appSettings: "id",
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<PlayerRecord>("players")
          .toCollection()
          .modify((player) => {
            player.normalizedName = normalizePlayerName(player.name);
          });
        const settings = transaction.table<AppSettingsRecord>("appSettings");
        if ((await settings.count()) === 0) {
          await settings.add(defaultSettings(Date.now()));
        }
      });

    this.on("populate", () => {
      void this.appSettings.add(defaultSettings(Date.now()));
    });
  }
}

export const db = new FairPlayDatabase();
