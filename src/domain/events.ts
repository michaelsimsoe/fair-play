import type { MatchEventId, MatchId, PlayerId } from "./ids";
import type { MatchStatus } from "./types";

export type EventSource = "user" | "suggested-confirmation" | "recovery" | "system";
export type MatchEventType =
  | "MATCH_STARTED"
  | "SUBSTITUTION_CONFIRMED"
  | "LINEUP_SYNCHRONIZED"
  | "PLAYER_AVAILABILITY_CHANGED"
  | "MATCH_PAUSED"
  | "MATCH_RESUMED"
  | "MATCH_DURATION_CHANGED"
  | "MATCH_ENDED"
  | "MATCH_ABANDONED"
  | "EVENT_VOIDED"
  | "EVENT_REPLACED";

export type EventEnvelope<T extends MatchEventType, P> = Readonly<{
  id: MatchEventId;
  matchId: MatchId;
  sequence: number;
  type: T;
  elapsedMs: number;
  recordedAtWallMs: number;
  source: EventSource;
  schemaVersion: 1;
  payload: P;
}>;

export type MatchStartedEvent = EventEnvelope<
  "MATCH_STARTED",
  {
    starterLineupIds: readonly PlayerId[];
    availablePlayerIds: readonly PlayerId[];
    plannedDurationMs?: number;
    playersOnField?: number;
  }
>;
export type SubstitutionConfirmedEvent = EventEnvelope<
  "SUBSTITUTION_CONFIRMED",
  {
    outgoingPlayerIds: readonly PlayerId[];
    incomingPlayerIds: readonly PlayerId[];
    lineupBeforeIds?: readonly PlayerId[];
    lineupAfterIds?: readonly PlayerId[];
    recommendationId?: string;
  }
>;
export type LineupSynchronizedEvent = EventEnvelope<
  "LINEUP_SYNCHRONIZED",
  {
    lineupBeforeIds?: readonly PlayerId[];
    lineupAfterIds: readonly PlayerId[];
    reason?: string;
  }
>;
export type PlayerAvailabilityChangedEvent = EventEnvelope<
  "PLAYER_AVAILABILITY_CHANGED",
  {
    playerId: PlayerId;
    available: boolean;
    previousAvailable?: boolean;
    reason?: string;
  }
>;
export type MatchPausedEvent = EventEnvelope<"MATCH_PAUSED", { reason?: string }>;
export type MatchResumedEvent = EventEnvelope<"MATCH_RESUMED", { reason?: string }>;
export type MatchDurationChangedEvent = EventEnvelope<
  "MATCH_DURATION_CHANGED",
  { previousDurationMs?: number; newDurationMs: number }
>;
export type MatchEndedEvent = EventEnvelope<"MATCH_ENDED", { reason?: string }>;
export type MatchAbandonedEvent = EventEnvelope<"MATCH_ABANDONED", { reason?: string }>;

export type HistoryEvent =
  | MatchStartedEvent
  | SubstitutionConfirmedEvent
  | LineupSynchronizedEvent
  | PlayerAvailabilityChangedEvent
  | MatchPausedEvent
  | MatchResumedEvent
  | MatchDurationChangedEvent
  | MatchEndedEvent
  | MatchAbandonedEvent;

export type EventVoidedEvent = EventEnvelope<
  "EVENT_VOIDED",
  { targetEventId: MatchEventId; reason?: string }
>;
export type EventReplacedEvent = EventEnvelope<
  "EVENT_REPLACED",
  {
    targetEventId: MatchEventId;
    /*
     * A replacement can be a complete envelope or just the history fields to
     * change. The projector retains the original target identity and order.
     */
    replacement: Partial<
      Omit<HistoryEvent, "id" | "matchId" | "sequence" | "schemaVersion">
    > &
      Pick<HistoryEvent, "type" | "payload">;
    reason?: string;
  }
>;

export type MatchEvent = HistoryEvent | EventVoidedEvent | EventReplacedEvent;

export const compareEvents = (left: MatchEvent, right: MatchEvent): number =>
  left.elapsedMs - right.elapsedMs ||
  left.sequence - right.sequence ||
  String(left.id).localeCompare(String(right.id));

export const orderedEvents = (events: readonly MatchEvent[]): MatchEvent[] =>
  [...events].sort(compareEvents);

export type EffectiveEvents = Readonly<{
  events: readonly HistoryEvent[];
  issues: readonly Readonly<{ eventId: string; message: string }>[];
}>;

/**
 * Corrections are evaluated against the full audit stream, not merely events
 * seen so far. This makes replay independent of when a correction was added.
 */
export function effectiveEvents(events: readonly MatchEvent[]): EffectiveEvents {
  const ordered = orderedEvents(events);
  const byId = new Map(ordered.map((event) => [String(event.id), event] as const));
  const voided = new Set<string>();
  const replacements = new Map<string, EventReplacedEvent>();
  const issues: Array<{ eventId: string; message: string }> = [];

  for (const event of ordered) {
    if (event.type === "EVENT_VOIDED") {
      if (!byId.has(String(event.payload.targetEventId))) {
        issues.push({
          eventId: String(event.id),
          message: "Void target does not exist.",
        });
      } else {
        voided.add(String(event.payload.targetEventId));
      }
    } else if (event.type === "EVENT_REPLACED") {
      const target = byId.get(String(event.payload.targetEventId));
      if (
        !target ||
        target.type === "EVENT_VOIDED" ||
        target.type === "EVENT_REPLACED"
      ) {
        issues.push({
          eventId: String(event.id),
          message: "Replacement target is not a history event.",
        });
      } else {
        replacements.set(String(event.payload.targetEventId), event);
      }
    }
  }

  const result: HistoryEvent[] = [];
  for (const event of ordered) {
    if (
      event.type === "EVENT_VOIDED" ||
      event.type === "EVENT_REPLACED" ||
      voided.has(String(event.id))
    )
      continue;
    const correction = replacements.get(String(event.id));
    if (!correction) {
      result.push(event);
      continue;
    }
    const candidate = {
      ...event,
      ...correction.payload.replacement,
      id: event.id,
      matchId: event.matchId,
      sequence: event.sequence,
      schemaVersion: 1,
    };
    if (!candidate.payload) {
      issues.push({
        eventId: String(correction.id),
        message: "Replacement must be a history event.",
      });
      result.push(event);
    } else {
      result.push(candidate as HistoryEvent);
    }
  }
  return { events: result.sort(compareEvents), issues };
}

export const eventStatus = (event: HistoryEvent, current: MatchStatus): MatchStatus => {
  switch (event.type) {
    case "MATCH_STARTED":
      return "running";
    case "MATCH_PAUSED":
      return current === "running" ? "paused" : current;
    case "MATCH_RESUMED":
      return current === "paused" ? "running" : current;
    case "MATCH_ENDED":
      return "completed";
    case "MATCH_ABANDONED":
      return "abandoned";
    default:
      return current;
  }
};
