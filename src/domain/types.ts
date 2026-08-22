import type { MatchId, PlayerId, TournamentId } from "./ids";

export type MatchStatus =
  "scheduled" | "ready" | "running" | "paused" | "completed" | "abandoned";

export type FairnessScope = "tournament" | "match";

export type TimeInterval = Readonly<{ startElapsedMs: number; endElapsedMs: number }>;

export type TimelineSegment = Readonly<{
  startElapsedMs: number;
  endElapsedMs: number;
  lineupIds: readonly PlayerId[];
  availablePlayerIds: readonly PlayerId[];
}>;

export type ProjectionIssueCode =
  | "event-before-start"
  | "event-after-end"
  | "event-time-regressed"
  | "invalid-event-time"
  | "invalid-lineup"
  | "invalid-substitution"
  | "unavailable-player-on-field"
  | "insufficient-available-players"
  | "unknown-event-target"
  | "invalid-replacement"
  | "invalid-duration";

export type ProjectionIssue = Readonly<{
  code: ProjectionIssueCode;
  eventId?: string;
  message: string;
}>;

export type MatchConfiguration = Readonly<{
  id: MatchId;
  tournamentId?: TournamentId;
  plannedDurationMs: number;
  playersOnField: number;
  eligiblePlayerIds: readonly PlayerId[];
  fairnessScope?: FairnessScope;
}>;

export type MatchProjection = Readonly<{
  status: MatchStatus;
  elapsedMs: number;
  currentLineupIds: readonly PlayerId[];
  currentlyAvailableIds: readonly PlayerId[];
  actualMsByPlayer: Readonly<Record<PlayerId, number>>;
  idealMsByPlayer: Readonly<Record<PlayerId, number>>;
  fairnessBalanceMsByPlayer: Readonly<Record<PlayerId, number>>;
  playingStintsByPlayer: Readonly<Record<PlayerId, readonly TimeInterval[]>>;
  benchStintsByPlayer: Readonly<Record<PlayerId, readonly TimeInterval[]>>;
  timelineSegments: readonly TimelineSegment[];
  eventIssues: readonly ProjectionIssue[];
}>;

export type RecommendationReason =
  | "normal-rotation"
  | "player-behind-target"
  | "player-ahead-of-target"
  | "availability-change"
  | "manual-deviation"
  | "short-time-remaining";

export type Recommendation = Readonly<{
  id: string;
  calculatedAtElapsedMs: number;
  dueAtElapsedMs: number;
  swaps: readonly Readonly<{
    outgoingPlayerId: PlayerId;
    incomingPlayerId: PlayerId;
  }>[];
  projectedActualMsByPlayer: Readonly<Record<PlayerId, number>>;
  projectedIdealMsByPlayer: Readonly<Record<PlayerId, number>>;
  projectedBalanceMsByPlayer: Readonly<Record<PlayerId, number>>;
  projectedBalanceRangeMs: number;
  reasons: readonly RecommendationReason[];
  diagnostics: Readonly<{
    perfectTargetFeasible: boolean;
    expectedSubstitutionCount: number;
    shortStintWarnings: readonly PlayerId[];
  }>;
}>;
