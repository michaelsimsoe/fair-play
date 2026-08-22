import type { ZodError } from "zod";
import { db as defaultDatabase } from "./db";
import type { FairPlayDatabase } from "./db";
import {
  backupEnvelopeSchema,
  defaultSettings,
  normalizePlayerName,
  seedEnvelopeSchema,
  type BackupEnvelope,
  type MatchRecord,
  type PlayerRecord,
  type SeedEnvelope,
  type TournamentRecord,
} from "./schema";

const APP_VERSION = "1.0.0";

export class ImportValidationError extends Error {
  constructor(
    message: string,
    readonly issues: string[],
  ) {
    super(message);
    this.name = "ImportValidationError";
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ImportValidationError("Filen er ikke gyldig JSON.", ["Ugyldig JSON"]);
  }
}

function formatZodIssues(error: ZodError): string[] {
  return error.issues.map(
    (issue) => `${issue.path.join(".") || "fil"}: ${issue.message}`,
  );
}

export async function exportBackup(
  database: FairPlayDatabase = defaultDatabase,
): Promise<string> {
  const [tournaments, players, matches, matchEvents, appSettings] = await Promise.all([
    database.tournaments.toArray(),
    database.players.toArray(),
    database.matches.toArray(),
    database.matchEvents.toArray(),
    database.appSettings.get("settings"),
  ]);
  const envelope: BackupEnvelope = {
    format: "fairplay-sideline-backup",
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    data: {
      tournaments,
      players,
      matches,
      matchEvents,
      appSettings: appSettings ?? defaultSettings(Date.now()),
    },
  };
  return JSON.stringify(envelope, null, 2);
}

type ImportMode = "copy" | "restore";

export async function importBackup(
  text: string,
  mode: ImportMode,
  database: FairPlayDatabase = defaultDatabase,
): Promise<string[]> {
  const result = backupEnvelopeSchema.safeParse(parseJson(text));
  if (!result.success) {
    throw new ImportValidationError(
      "Sikkerhetskopien kunne ikke leses.",
      formatZodIssues(result.error),
    );
  }

  const data = mode === "copy" ? remapBackupAsCopy(result.data) : result.data;
  await database.transaction(
    "rw",
    [
      database.tournaments,
      database.players,
      database.matches,
      database.matchEvents,
      database.activeMatchJournals,
      database.appSettings,
    ],
    async () => {
      if (mode === "restore") {
        await Promise.all([
          database.tournaments.clear(),
          database.players.clear(),
          database.matches.clear(),
          database.matchEvents.clear(),
          database.activeMatchJournals.clear(),
          database.appSettings.clear(),
        ]);
      } else {
        const incomingIds = data.data.tournaments.map(({ id }) => id);
        const conflicts = await database.tournaments.bulkGet(incomingIds);
        if (conflicts.some(Boolean)) {
          throw new Error("ID-konflikt under import.");
        }
      }

      await database.tournaments.bulkAdd(data.data.tournaments);
      await database.players.bulkAdd(data.data.players);
      await database.matches.bulkAdd(data.data.matches);
      await database.matchEvents.bulkAdd(data.data.matchEvents);
      if (mode === "restore") {
        await database.appSettings.put(data.data.appSettings);
      }
    },
  );
  return data.data.tournaments.map((tournament) => tournament.id);
}

export async function importSeed(
  text: string,
  database: FairPlayDatabase = defaultDatabase,
): Promise<string> {
  const result = seedEnvelopeSchema.safeParse(parseJson(text));
  if (!result.success) {
    throw new ImportValidationError(
      "Eksempeldataene kunne ikke leses.",
      formatZodIssues(result.error),
    );
  }
  const records = seedToRecords(result.data);
  await database.transaction(
    "rw",
    [database.tournaments, database.players, database.matches],
    async () => {
      await database.tournaments.add(records.tournament);
      await database.players.bulkAdd(records.players);
      await database.matches.bulkAdd(records.matches);
    },
  );
  return records.tournament.id;
}

function seedToRecords(seed: SeedEnvelope): {
  tournament: TournamentRecord;
  players: PlayerRecord[];
  matches: MatchRecord[];
} {
  const now = Date.now();
  const tournamentId = crypto.randomUUID();
  const playerIds = new Map(
    seed.players.map((player) => [player.id, crypto.randomUUID()]),
  );

  const tournament: TournamentRecord = {
    ...seed.tournament,
    id: tournamentId,
    createdAtWallMs: now,
    updatedAtWallMs: now,
  };
  const players: PlayerRecord[] = seed.players.map((player) => ({
    ...player,
    id: playerIds.get(player.id)!,
    tournamentId,
    normalizedName: normalizePlayerName(player.name),
    createdAtWallMs: now,
  }));
  const matches: MatchRecord[] = seed.matches.map((match, index) => ({
    ...match,
    id: crypto.randomUUID(),
    tournamentId,
    eligiblePlayerIds: match.eligiblePlayerIds.map((id) => playerIds.get(id)!),
    selectedStarterIds:
      index === 0
        ? seed.suggestedFirstMatchStarters?.map((id) => playerIds.get(id)!)
        : undefined,
    minimumStintMs: seed.tournament.defaultMinimumStintMs,
    alertLeadMs: seed.tournament.defaultAlertLeadMs,
    status: index === 0 ? "ready" : "scheduled",
    createdAtWallMs: now,
    updatedAtWallMs: now,
  }));
  return { tournament, players, matches };
}

function remapBackupAsCopy(envelope: BackupEnvelope): BackupEnvelope {
  const idMap = new Map<string, string>();
  const allIds = [
    ...envelope.data.tournaments.map(({ id }) => id),
    ...envelope.data.players.map(({ id }) => id),
    ...envelope.data.matches.map(({ id }) => id),
    ...envelope.data.matchEvents.map(({ id }) => id),
  ];
  for (const oldId of allIds) idMap.set(oldId, crypto.randomUUID());

  const remap = (value: unknown): unknown => {
    if (typeof value === "string") return idMap.get(value) ?? value;
    if (Array.isArray(value)) return value.map(remap);
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, child]) => [key, remap(child)]),
      );
    }
    return value;
  };

  const copied = backupEnvelopeSchema.parse(remap(envelope));
  copied.data.tournaments = copied.data.tournaments.map((tournament) => ({
    ...tournament,
    name: `${tournament.name} (kopi)`,
    updatedAtWallMs: Date.now(),
  }));
  return copied;
}
