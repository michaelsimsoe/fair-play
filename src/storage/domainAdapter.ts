import {
  matchEventId,
  matchId,
  playerId,
  tournamentId,
  type HistoryEvent,
  type MatchConfiguration,
  type MatchEvent,
} from "../domain";
import { matchEventSchema, type MatchEventRecord, type MatchRecord } from "./schema";

export function toDomainConfiguration(match: MatchRecord): MatchConfiguration {
  return {
    id: matchId(match.id),
    tournamentId: tournamentId(match.tournamentId),
    plannedDurationMs: match.plannedDurationMs,
    playersOnField: match.playersOnField,
    eligiblePlayerIds: match.eligiblePlayerIds.map(playerId),
  };
}

function eventBase(event: MatchEventRecord) {
  return {
    id: matchEventId(event.id),
    matchId: matchId(event.matchId),
    sequence: event.sequence,
    elapsedMs: event.elapsedMs,
    recordedAtWallMs: event.recordedAtWallMs,
    source: event.source,
    schemaVersion: 1 as const,
  };
}

export function toDomainEvent(event: MatchEventRecord): MatchEvent {
  const base = eventBase(event);
  switch (event.type) {
    case "MATCH_STARTED":
      return {
        ...base,
        type: event.type,
        payload: {
          starterLineupIds: event.payload.starterLineupIds.map(playerId),
          availablePlayerIds: event.payload.availablePlayerIds.map(playerId),
          ...(event.payload.plannedDurationMs === undefined
            ? {}
            : { plannedDurationMs: event.payload.plannedDurationMs }),
          ...(event.payload.playersOnField === undefined
            ? {}
            : { playersOnField: event.payload.playersOnField }),
        },
      };
    case "SUBSTITUTION_CONFIRMED":
      return {
        ...base,
        type: event.type,
        payload: {
          outgoingPlayerIds: event.payload.outgoingPlayerIds.map(playerId),
          incomingPlayerIds: event.payload.incomingPlayerIds.map(playerId),
          ...(event.payload.lineupBeforeIds
            ? { lineupBeforeIds: event.payload.lineupBeforeIds.map(playerId) }
            : {}),
          ...(event.payload.lineupAfterIds
            ? { lineupAfterIds: event.payload.lineupAfterIds.map(playerId) }
            : {}),
          ...(event.payload.recommendationId
            ? { recommendationId: event.payload.recommendationId }
            : {}),
        },
      };
    case "LINEUP_SYNCHRONIZED":
      return {
        ...base,
        type: event.type,
        payload: {
          lineupAfterIds: event.payload.lineupAfterIds.map(playerId),
          ...(event.payload.lineupBeforeIds
            ? { lineupBeforeIds: event.payload.lineupBeforeIds.map(playerId) }
            : {}),
          ...(event.payload.reason ? { reason: event.payload.reason } : {}),
        },
      };
    case "PLAYER_AVAILABILITY_CHANGED":
      return {
        ...base,
        type: event.type,
        payload: {
          playerId: playerId(event.payload.playerId),
          available: event.payload.available,
          ...(event.payload.previousAvailable === undefined
            ? {}
            : { previousAvailable: event.payload.previousAvailable }),
          ...(event.payload.reason ? { reason: event.payload.reason } : {}),
        },
      };
    case "MATCH_PAUSED":
    case "MATCH_RESUMED":
    case "MATCH_ENDED":
    case "MATCH_ABANDONED":
      return {
        ...base,
        type: event.type,
        payload: event.payload.reason ? { reason: event.payload.reason } : {},
      };
    case "MATCH_DURATION_CHANGED":
      return {
        ...base,
        type: event.type,
        payload: {
          newDurationMs: event.payload.newDurationMs,
          ...(event.payload.previousDurationMs === undefined
            ? {}
            : { previousDurationMs: event.payload.previousDurationMs }),
        },
      };
    case "EVENT_VOIDED":
      return {
        ...base,
        type: event.type,
        payload: {
          targetEventId: matchEventId(event.payload.targetEventId),
          ...(event.payload.reason ? { reason: event.payload.reason } : {}),
        },
      };
    case "EVENT_REPLACED": {
      const replacement = event.payload.replacement;
      const parsed = matchEventSchema.safeParse({
        ...base,
        id: event.id,
        matchId: event.matchId,
        type: replacement.type,
        elapsedMs: replacement.elapsedMs ?? event.elapsedMs,
        recordedAtWallMs: replacement.recordedAtWallMs ?? event.recordedAtWallMs,
        source: replacement.source ?? event.source,
        payload: replacement.payload,
      });
      if (!parsed.success) {
        throw new Error("En korrigert hendelse har ugyldig innhold.");
      }
      const converted = toDomainEvent(parsed.data);
      if (converted.type === "EVENT_VOIDED" || converted.type === "EVENT_REPLACED") {
        throw new Error("En korreksjon kan ikke erstatte med en ny korreksjon.");
      }
      const replacementEvent: Pick<HistoryEvent, "type" | "payload"> & {
        elapsedMs?: number;
        recordedAtWallMs?: number;
        source?: HistoryEvent["source"];
      } = {
        type: converted.type,
        payload: converted.payload,
        ...(replacement.elapsedMs === undefined
          ? {}
          : { elapsedMs: replacement.elapsedMs }),
        ...(replacement.recordedAtWallMs === undefined
          ? {}
          : { recordedAtWallMs: replacement.recordedAtWallMs }),
        ...(replacement.source === undefined ? {} : { source: replacement.source }),
      };
      return {
        ...base,
        type: event.type,
        payload: {
          targetEventId: matchEventId(event.payload.targetEventId),
          replacement: replacementEvent,
          ...(event.payload.reason ? { reason: event.payload.reason } : {}),
        },
      };
    }
  }
}

export function toDomainEvents(events: readonly MatchEventRecord[]): MatchEvent[] {
  return events.map(toDomainEvent);
}
