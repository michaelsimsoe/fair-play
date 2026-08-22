import {
  effectiveEvents,
  eventStatus,
  type HistoryEvent,
  type MatchEvent,
} from "./events";
import { addFairnessInterval, balancesFromTotals, emptyPlayerTotals } from "./fairness";
import type { PlayerId } from "./ids";
import type {
  MatchConfiguration,
  MatchProjection,
  MatchStatus,
  ProjectionIssue,
  TimeInterval,
  TimelineSegment,
} from "./types";
import { validateLineup, validateSubstitution } from "./validation";

export type ProjectMatchOptions = Readonly<{ endElapsedMs?: number }>;

const makeIntervals = (
  playerIds: readonly PlayerId[],
  segments: readonly TimelineSegment[],
  kind: "playing" | "bench",
) => {
  const result = Object.fromEntries(
    playerIds.map((id) => [id, [] as TimeInterval[]]),
  ) as Record<PlayerId, TimeInterval[]>;
  for (const segment of segments) {
    for (const id of playerIds) {
      const applies =
        kind === "playing"
          ? segment.lineupIds.includes(id)
          : segment.availablePlayerIds.includes(id) && !segment.lineupIds.includes(id);
      if (!applies) continue;
      const intervals = result[id]!;
      const previous = intervals[intervals.length - 1];
      if (previous && previous.endElapsedMs === segment.startElapsedMs) {
        intervals[intervals.length - 1] = {
          startElapsedMs: previous.startElapsedMs,
          endElapsedMs: segment.endElapsedMs,
        };
      } else {
        intervals.push({
          startElapsedMs: segment.startElapsedMs,
          endElapsedMs: segment.endElapsedMs,
        });
      }
    }
  }
  return result;
};

const issue = (
  issues: ProjectionIssue[],
  code: ProjectionIssue["code"],
  eventId: string | undefined,
  message: string,
) =>
  issues.push(eventId === undefined ? { code, message } : { code, eventId, message });

/**
 * Replays active elapsed time. Pause events deliberately have no timing branch:
 * the event clock itself excludes paused wall time.
 */
export function projectMatch(
  configuration: MatchConfiguration,
  events: readonly MatchEvent[],
  options: ProjectMatchOptions = {},
): MatchProjection {
  const playerIds = [...configuration.eligiblePlayerIds];
  const actual = emptyPlayerTotals(playerIds);
  const ideal = emptyPlayerTotals(playerIds);
  const issues: ProjectionIssue[] = [];
  const effective = effectiveEvents(events);
  for (const correctionIssue of effective.issues)
    issue(
      issues,
      "unknown-event-target",
      correctionIssue.eventId,
      correctionIssue.message,
    );

  let status: MatchStatus = "ready";
  let lineup: PlayerId[] = [];
  let available: PlayerId[] = [];
  let duration = configuration.plannedDurationMs;
  let cursor = 0;
  let started = false;
  let ended = false;
  const segments: TimelineSegment[] = [];

  if (!Number.isInteger(duration) || duration < 0) {
    issue(
      issues,
      "invalid-duration",
      undefined,
      "Planned duration must be a non-negative integer.",
    );
    duration = 0;
  }
  if (
    !Number.isInteger(configuration.playersOnField) ||
    configuration.playersOnField <= 0
  ) {
    issue(
      issues,
      "invalid-lineup",
      undefined,
      "Field slots must be a positive integer.",
    );
  }

  const addInterval = (end: number) => {
    if (!started || end <= cursor) return;
    const intervalEnd = Math.min(end, duration);
    if (intervalEnd <= cursor) return;
    addFairnessInterval(
      actual,
      ideal,
      lineup,
      available,
      intervalEnd - cursor,
      configuration.playersOnField,
    );
    segments.push({
      startElapsedMs: cursor,
      endElapsedMs: intervalEnd,
      lineupIds: [...lineup],
      availablePlayerIds: [...available],
    });
    if (available.length < configuration.playersOnField) {
      issue(
        issues,
        "insufficient-available-players",
        undefined,
        "Fewer players are available than field slots.",
      );
    }
    cursor = intervalEnd;
  };

  for (const event of effective.events) {
    if (!Number.isInteger(event.elapsedMs) || event.elapsedMs < 0) {
      issue(
        issues,
        "invalid-event-time",
        String(event.id),
        "Event elapsed time must be a non-negative integer.",
      );
      continue;
    }
    if (ended) {
      issue(
        issues,
        "event-after-end",
        String(event.id),
        "Event occurs after match end.",
      );
      continue;
    }
    if (event.elapsedMs < cursor) {
      issue(
        issues,
        "event-time-regressed",
        String(event.id),
        "Event elapsed time regresses the active timeline.",
      );
      continue;
    }
    // A duration change at the current end is legal and permits explicit overtime.
    if (event.elapsedMs > duration && event.type !== "MATCH_DURATION_CHANGED") {
      addInterval(duration);
      issue(
        issues,
        "event-after-end",
        String(event.id),
        "Event occurs after the allowed match duration.",
      );
      continue;
    }
    addInterval(event.elapsedMs);
    // No player may accrue an interval before the authoritative start fact.
    if (!started && event.type === "MATCH_STARTED") cursor = event.elapsedMs;
    applyEvent(event, {
      configuration,
      issues,
      get lineup() {
        return lineup;
      },
      set lineup(value: PlayerId[]) {
        lineup = value;
      },
      get available() {
        return available;
      },
      set available(value: PlayerId[]) {
        available = value;
      },
      get duration() {
        return duration;
      },
      set duration(value: number) {
        duration = value;
      },
      get started() {
        return started;
      },
      set started(value: boolean) {
        started = value;
      },
      get ended() {
        return ended;
      },
      set ended(value: boolean) {
        ended = value;
      },
      get status() {
        return status;
      },
      set status(value: MatchStatus) {
        status = value;
      },
    });
  }

  const requestedEnd = options.endElapsedMs ?? cursor;
  if (Number.isInteger(requestedEnd) && requestedEnd >= cursor && !ended)
    addInterval(Math.min(requestedEnd, duration));
  else if (requestedEnd < cursor)
    issue(
      issues,
      "event-time-regressed",
      undefined,
      "Projection end precedes the event stream.",
    );

  return {
    status,
    elapsedMs: cursor,
    currentLineupIds: [...lineup],
    currentlyAvailableIds: [...available],
    actualMsByPlayer: actual,
    idealMsByPlayer: ideal,
    fairnessBalanceMsByPlayer: balancesFromTotals(actual, ideal, playerIds),
    playingStintsByPlayer: makeIntervals(playerIds, segments, "playing"),
    benchStintsByPlayer: makeIntervals(playerIds, segments, "bench"),
    timelineSegments: segments,
    eventIssues: issues,
  };
}

type ReplayState = {
  configuration: MatchConfiguration;
  issues: ProjectionIssue[];
  lineup: PlayerId[];
  available: PlayerId[];
  duration: number;
  started: boolean;
  ended: boolean;
  status: MatchStatus;
};

function applyEvent(event: HistoryEvent, state: ReplayState): void {
  const id = String(event.id);
  if (event.type !== "MATCH_STARTED" && !state.started) {
    issue(state.issues, "event-before-start", id, "Event occurs before match start.");
    return;
  }
  switch (event.type) {
    case "MATCH_STARTED": {
      if (state.started) {
        issue(state.issues, "invalid-lineup", id, "Match can only be started once.");
        return;
      }
      const requestedAvailable = new Set(event.payload.availablePlayerIds);
      if (
        [...requestedAvailable].some(
          (playerId) => !state.configuration.eligiblePlayerIds.includes(playerId),
        )
      ) {
        issue(
          state.issues,
          "invalid-lineup",
          id,
          "Start availability contains an ineligible player.",
        );
      }
      const available = state.configuration.eligiblePlayerIds.filter((playerId) =>
        requestedAvailable.has(playerId),
      );
      const validation = validateLineup(
        event.payload.starterLineupIds,
        available,
        event.payload.playersOnField ?? state.configuration.playersOnField,
      );
      if (!validation.valid)
        issue(state.issues, "invalid-lineup", id, validation.errors.join(" "));
      state.available = available;
      state.lineup = validation.valid ? [...event.payload.starterLineupIds] : [];
      if (event.payload.plannedDurationMs !== undefined) {
        if (
          !Number.isInteger(event.payload.plannedDurationMs) ||
          event.payload.plannedDurationMs < 0
        ) {
          issue(
            state.issues,
            "invalid-duration",
            id,
            "Start duration must be a non-negative integer.",
          );
        } else state.duration = event.payload.plannedDurationMs;
      }
      state.started = true;
      state.status = "running";
      return;
    }
    case "SUBSTITUTION_CONFIRMED": {
      const validation = validateSubstitution(
        state.lineup,
        state.available,
        event.payload.outgoingPlayerIds,
        event.payload.incomingPlayerIds,
      );
      if (!validation.valid) {
        issue(state.issues, "invalid-substitution", id, validation.errors.join(" "));
        return;
      }
      const outgoing = new Set(event.payload.outgoingPlayerIds);
      state.lineup = [
        ...state.lineup.filter((playerId) => !outgoing.has(playerId)),
        ...event.payload.incomingPlayerIds,
      ];
      return;
    }
    case "LINEUP_SYNCHRONIZED": {
      const validation = validateLineup(
        event.payload.lineupAfterIds,
        state.available,
        state.configuration.playersOnField,
      );
      if (!validation.valid) {
        issue(state.issues, "invalid-lineup", id, validation.errors.join(" "));
        return;
      }
      state.lineup = [...event.payload.lineupAfterIds];
      return;
    }
    case "PLAYER_AVAILABILITY_CHANGED": {
      if (!state.configuration.eligiblePlayerIds.includes(event.payload.playerId)) {
        issue(
          state.issues,
          "invalid-lineup",
          id,
          "Availability change references an ineligible player.",
        );
        return;
      }
      const next = new Set(state.available);
      if (event.payload.available) next.add(event.payload.playerId);
      else next.delete(event.payload.playerId);
      state.available = state.configuration.eligiblePlayerIds.filter((playerId) =>
        next.has(playerId),
      );
      if (!event.payload.available && state.lineup.includes(event.payload.playerId)) {
        issue(
          state.issues,
          "unavailable-player-on-field",
          id,
          "An unavailable player remains on the field until a lineup correction.",
        );
      }
      return;
    }
    case "MATCH_DURATION_CHANGED":
      if (
        !Number.isInteger(event.payload.newDurationMs) ||
        event.payload.newDurationMs < event.elapsedMs
      ) {
        issue(
          state.issues,
          "invalid-duration",
          id,
          "New duration must be an integer no earlier than this event.",
        );
      } else state.duration = event.payload.newDurationMs;
      return;
    case "MATCH_ENDED":
    case "MATCH_ABANDONED":
      state.ended = true;
      state.status = eventStatus(event, state.status);
      return;
    default:
      state.status = eventStatus(event, state.status);
  }
}
