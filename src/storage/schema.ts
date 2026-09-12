import { z } from "zod";

const id = z.string().min(1);
const milliseconds = z.number().int().nonnegative();
const wallTime = z.number().int().nonnegative();

export const tournamentSchema = z
  .object({
    id,
    name: z.string().trim().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    timezone: z.string().min(1),
    teamName: z.string().trim().min(1),
    coachLabel: z.string().trim().optional(),
    defaultMatchDurationMs: milliseconds.positive(),
    defaultPlayersOnField: z.number().int().positive(),
    defaultMinimumStintMs: milliseconds,
    defaultAlertLeadMs: milliseconds,
    fairnessScope: z.enum(["tournament", "match"]),
    createdAtWallMs: wallTime,
    updatedAtWallMs: wallTime,
    archivedAtWallMs: wallTime.optional(),
  })
  .strict();

export const playerMembershipSchema = z.enum(["team", "guest"]);

const playerBase = {
  id,
  tournamentId: id,
  name: z.string().trim().min(1),
  normalizedName: z.string().min(1),
  sortOrder: z.number().int().nonnegative(),
  active: z.boolean(),
  explicitUnavailableMatchIds: z.array(id),
  unavailableMatchIds: z.array(id),
  participationPauses: z.array(
    z
      .object({
        id,
        originMatchId: id,
        scope: z.enum(["current", "through-next", "rest-day"]),
        matchIds: z.array(id),
        balanceTreatment: z.enum(["preserve", "waive"]),
        availabilityActive: z.boolean(),
        compensationActive: z.boolean(),
      })
      .strict(),
  ),
  fairnessAdjustments: z.array(
    z
      .object({
        id,
        matchId: id,
        elapsedMs: milliseconds,
        amountMs: z.number().int(),
        recordedAtWallMs: wallTime,
        reason: z.string().min(1),
      })
      .strict(),
  ),
  createdAtWallMs: wallTime,
  archivedAtWallMs: wallTime.optional(),
};

export const playerSchema = z
  .object({
    ...playerBase,
    membership: playerMembershipSchema,
  })
  .strict();

const legacyPlayerSchema = z
  .object({
    id,
    tournamentId: id,
    name: z.string().trim().min(1),
    normalizedName: z.string().min(1),
    sortOrder: z.number().int().nonnegative(),
    active: z.boolean(),
    createdAtWallMs: wallTime,
    archivedAtWallMs: wallTime.optional(),
  })
  .strict();

export const matchStatusSchema = z.enum([
  "scheduled",
  "ready",
  "running",
  "paused",
  "completed",
  "abandoned",
]);

export const matchSchema = z
  .object({
    id,
    tournamentId: id,
    order: z.number().int().nonnegative(),
    scheduledStartLocal: z.string().optional(),
    opponent: z.string().trim().optional(),
    pitch: z.string().trim().optional(),
    notes: z.string().trim().optional(),
    plannedDurationMs: milliseconds.positive(),
    playersOnField: z.number().int().positive(),
    minimumStintMs: milliseconds,
    alertLeadMs: milliseconds,
    eligiblePlayerIds: z.array(id),
    selectedStarterIds: z.array(id).optional(),
    status: matchStatusSchema,
    createdAtWallMs: wallTime,
    updatedAtWallMs: wallTime,
  })
  .strict();

const eventBase = {
  id,
  matchId: id,
  sequence: z.number().int().nonnegative(),
  elapsedMs: milliseconds,
  recordedAtWallMs: wallTime,
  source: z.enum(["user", "suggested-confirmation", "recovery", "system"]),
  schemaVersion: z.literal(1),
};

export const matchEventSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...eventBase,
      type: z.literal("MATCH_STARTED"),
      payload: z
        .object({
          starterLineupIds: z.array(id),
          availablePlayerIds: z.array(id),
          plannedDurationMs: milliseconds.optional(),
          playersOnField: z.number().int().positive().optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...eventBase,
      type: z.literal("SUBSTITUTION_CONFIRMED"),
      payload: z
        .object({
          outgoingPlayerIds: z.array(id).min(1),
          incomingPlayerIds: z.array(id).min(1),
          lineupBeforeIds: z.array(id).optional(),
          lineupAfterIds: z.array(id).optional(),
          recommendationId: id.optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...eventBase,
      type: z.literal("LINEUP_SYNCHRONIZED"),
      payload: z
        .object({
          lineupBeforeIds: z.array(id).optional(),
          lineupAfterIds: z.array(id),
          reason: z.string().optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...eventBase,
      type: z.literal("PLAYER_AVAILABILITY_CHANGED"),
      payload: z
        .object({
          playerId: id,
          previousAvailable: z.boolean().optional(),
          available: z.boolean(),
          reason: z.string().optional(),
          pauseScope: z.enum(["current", "through-next", "rest-day"]).optional(),
          balanceTreatment: z.enum(["preserve", "waive"]).optional(),
          previousUnavailableMatchIds: z.array(id).optional(),
          pausedMatchIds: z.array(id).optional(),
          participationPauseId: id.optional(),
          fairnessAdjustmentId: id.optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...eventBase,
      type: z.literal("MATCH_PAUSED"),
      payload: z.object({ reason: z.string().optional() }).strict(),
    })
    .strict(),
  z
    .object({
      ...eventBase,
      type: z.literal("MATCH_RESUMED"),
      payload: z.object({ reason: z.string().optional() }).strict(),
    })
    .strict(),
  z
    .object({
      ...eventBase,
      type: z.literal("MATCH_DURATION_CHANGED"),
      payload: z
        .object({
          previousDurationMs: milliseconds.optional(),
          newDurationMs: milliseconds,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...eventBase,
      type: z.literal("MATCH_ENDED"),
      payload: z.object({ reason: z.string().optional() }).strict(),
    })
    .strict(),
  z
    .object({
      ...eventBase,
      type: z.literal("MATCH_ABANDONED"),
      payload: z.object({ reason: z.string().optional() }).strict(),
    })
    .strict(),
  z
    .object({
      ...eventBase,
      type: z.literal("EVENT_VOIDED"),
      payload: z
        .object({
          targetEventId: id,
          reason: z.string().optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...eventBase,
      type: z.literal("EVENT_REPLACED"),
      payload: z
        .object({
          targetEventId: id,
          replacement: z
            .object({
              type: z.enum([
                "MATCH_STARTED",
                "SUBSTITUTION_CONFIRMED",
                "LINEUP_SYNCHRONIZED",
                "PLAYER_AVAILABILITY_CHANGED",
                "MATCH_PAUSED",
                "MATCH_RESUMED",
                "MATCH_DURATION_CHANGED",
                "MATCH_ENDED",
                "MATCH_ABANDONED",
              ]),
              payload: z.record(z.string(), z.unknown()),
              elapsedMs: milliseconds.optional(),
              recordedAtWallMs: wallTime.optional(),
              source: z
                .enum(["user", "suggested-confirmation", "recovery", "system"])
                .optional(),
            })
            .strict(),
          reason: z.string().optional(),
        })
        .strict(),
    })
    .strict(),
]);

export const activeMatchJournalSchema = z
  .object({
    matchId: id,
    clockStatus: z.enum(["running", "paused"]),
    elapsedAtSnapshotMs: milliseconds,
    snapshotWallMs: wallTime,
    lastResumeWallMs: wallTime.optional(),
    plannedDurationMs: milliseconds.positive(),
    currentLineupIds: z.array(id),
    lastEventSequence: z.number().int().nonnegative(),
    savedAtWallMs: wallTime,
  })
  .strict();

export const appSettingsSchema = z
  .object({
    id: z.literal("settings"),
    soundEnabled: z.boolean(),
    vibrationEnabled: z.boolean(),
    visualFlashEnabled: z.boolean(),
    fieldMode: z.enum(["system", "light", "dark"]),
    lastTournamentId: id.optional(),
    updatedAtWallMs: wallTime,
  })
  .strict();

export const backupEnvelopeSchema = z
  .object({
    format: z.literal("fairplay-sideline-backup"),
    schemaVersion: z.literal(3),
    exportedAt: z.string().datetime(),
    appVersion: z.string().min(1),
    data: z
      .object({
        tournaments: z.array(tournamentSchema),
        players: z.array(playerSchema),
        matches: z.array(matchSchema),
        matchEvents: z.array(matchEventSchema),
        appSettings: appSettingsSchema,
      })
      .strict(),
  })
  .strict();

export const legacyBackupEnvelopeSchema = z
  .object({
    format: z.literal("fairplay-sideline-backup"),
    schemaVersion: z.literal(1),
    exportedAt: z.string().datetime(),
    appVersion: z.string().min(1),
    data: z
      .object({
        tournaments: z.array(tournamentSchema),
        players: z.array(legacyPlayerSchema),
        matches: z.array(matchSchema),
        matchEvents: z.array(matchEventSchema),
        appSettings: appSettingsSchema,
      })
      .strict(),
  })
  .strict();

export const legacyV2BackupEnvelopeSchema = z
  .object({
    format: z.literal("fairplay-sideline-backup"),
    schemaVersion: z.literal(2),
    exportedAt: z.string().datetime(),
    appVersion: z.string().min(1),
    data: z
      .object({
        tournaments: z.array(tournamentSchema),
        players: z.array(
          legacyPlayerSchema.extend({ membership: playerMembershipSchema }),
        ),
        matches: z.array(matchSchema),
        matchEvents: z.array(matchEventSchema),
        appSettings: appSettingsSchema,
      })
      .strict(),
  })
  .strict();

export const seedEnvelopeSchema = z
  .object({
    format: z.literal("fairplay-sideline-seed"),
    schemaVersion: z.literal(1),
    tournament: z
      .object({
        id,
        name: z.string().min(1),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        timezone: z.string().min(1),
        teamName: z.string().min(1),
        coachLabel: z.string().optional(),
        defaultMatchDurationMs: milliseconds.positive(),
        defaultPlayersOnField: z.number().int().positive(),
        defaultMinimumStintMs: milliseconds,
        defaultAlertLeadMs: milliseconds,
        fairnessScope: z.enum(["tournament", "match"]),
      })
      .strict(),
    players: z.array(
      z
        .object({
          id,
          name: z.string().min(1),
          sortOrder: z.number().int().nonnegative(),
          active: z.boolean(),
          membership: playerMembershipSchema.optional(),
        })
        .strict(),
    ),
    matches: z.array(
      z
        .object({
          id,
          order: z.number().int().nonnegative(),
          scheduledStartLocal: z.string().optional(),
          opponent: z.string().optional(),
          pitch: z.string().optional(),
          plannedDurationMs: milliseconds.positive(),
          playersOnField: z.number().int().positive(),
          eligiblePlayerIds: z.array(id),
        })
        .strict(),
    ),
    suggestedFirstMatchStarters: z.array(id).optional(),
  })
  .strict();

export type TournamentRecord = z.infer<typeof tournamentSchema>;
export type PlayerRecord = z.infer<typeof playerSchema>;
export type MatchRecord = z.infer<typeof matchSchema>;
export type MatchEventRecord = z.infer<typeof matchEventSchema>;
export type ActiveMatchJournalRecord = z.infer<typeof activeMatchJournalSchema>;
export type AppSettingsRecord = z.infer<typeof appSettingsSchema>;
export type BackupEnvelope = z.infer<typeof backupEnvelopeSchema>;
export type SeedEnvelope = z.infer<typeof seedEnvelopeSchema>;

export const defaultSettings = (now: number): AppSettingsRecord => ({
  id: "settings",
  soundEnabled: true,
  vibrationEnabled: true,
  visualFlashEnabled: true,
  fieldMode: "system",
  updatedAtWallMs: now,
});

export function normalizePlayerName(name: string): string {
  return name.trim().toLocaleLowerCase("nb-NO").replace(/\s+/g, " ");
}
