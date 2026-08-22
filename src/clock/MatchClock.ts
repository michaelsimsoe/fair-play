import type { ClockSource } from "./ClockSource";

export type ClockStatus = "idle" | "running" | "paused" | "ended";
export type ClockAnomaly =
  "monotonic-clock-regressed" | "wall-clock-regressed" | "implausible-recovery-gap";

export type MatchClockState = Readonly<{
  status: ClockStatus;
  accumulatedActiveMs: number;
  resumedAtMonotonicMs?: number;
  resumedAtWallMs?: number;
  plannedDurationMs: number;
}>;

export type SerializedMatchClock = Readonly<{
  state: MatchClockState;
  anomalyFlags: readonly ClockAnomaly[];
}>;

export type ActiveMatchClockJournal = Readonly<{
  clockStatus: "running" | "paused";
  elapsedAtSnapshotMs: number;
  snapshotWallMs: number;
  lastResumeWallMs?: number;
  plannedDurationMs: number;
}>;

const finiteNonNegativeInteger = (value: number, label: string): void => {
  if (!Number.isInteger(value) || value < 0)
    throw new RangeError(`${label} must be a non-negative integer.`);
};

const integerElapsed = (value: number): number => Math.floor(Math.max(0, value));

const cloneState = (state: MatchClockState): MatchClockState => ({ ...state });

export class MatchClock {
  private state: MatchClockState;
  private readonly flags = new Set<ClockAnomaly>();

  public constructor(
    private readonly source: ClockSource,
    initialState: MatchClockState,
    initialFlags: readonly ClockAnomaly[] = [],
  ) {
    finiteNonNegativeInteger(initialState.accumulatedActiveMs, "accumulatedActiveMs");
    finiteNonNegativeInteger(initialState.plannedDurationMs, "plannedDurationMs");
    if (
      initialState.status === "running" &&
      initialState.resumedAtMonotonicMs === undefined
    ) {
      throw new RangeError("A running clock requires a monotonic anchor.");
    }
    this.state = cloneState(initialState);
    initialFlags.forEach((flag) => this.flags.add(flag));
  }

  public static idle(source: ClockSource, plannedDurationMs: number): MatchClock {
    return new MatchClock(source, {
      status: "idle",
      accumulatedActiveMs: 0,
      plannedDurationMs,
    });
  }

  public start(): number {
    if (this.state.status !== "idle") throw new Error("Only an idle clock can start.");
    this.state = {
      ...this.state,
      status: "running",
      resumedAtMonotonicMs: this.source.monotonicNowMs(),
      resumedAtWallMs: this.source.wallNowMs(),
    };
    return this.elapsedMs();
  }

  public elapsedMs(): number {
    if (this.state.status !== "running") return this.state.accumulatedActiveMs;
    const anchor = this.state.resumedAtMonotonicMs;
    if (anchor === undefined) return this.state.accumulatedActiveMs;
    const delta = this.source.monotonicNowMs() - anchor;
    if (delta < 0) this.flags.add("monotonic-clock-regressed");
    return integerElapsed(
      Math.min(
        this.state.plannedDurationMs,
        this.state.accumulatedActiveMs + Math.max(0, delta),
      ),
    );
  }

  public remainingMs(): number {
    return Math.max(0, this.state.plannedDurationMs - this.elapsedMs());
  }

  public pause(): number {
    if (this.state.status !== "running") return this.elapsedMs();
    const elapsed = this.elapsedMs();
    this.state = {
      ...this.state,
      status: "paused",
      accumulatedActiveMs: elapsed,
    };
    delete (this.state as { resumedAtMonotonicMs?: number }).resumedAtMonotonicMs;
    delete (this.state as { resumedAtWallMs?: number }).resumedAtWallMs;
    return elapsed;
  }

  public resume(): number {
    if (this.state.status !== "paused") return this.elapsedMs();
    this.state = {
      ...this.state,
      status: "running",
      resumedAtMonotonicMs: this.source.monotonicNowMs(),
      resumedAtWallMs: this.source.wallNowMs(),
    };
    return this.elapsedMs();
  }

  /** Explicitly extending the planned duration is the only route to overtime. */
  public extendTo(newPlannedDurationMs: number): number {
    finiteNonNegativeInteger(newPlannedDurationMs, "newPlannedDurationMs");
    const elapsed = this.elapsedMs();
    if (newPlannedDurationMs < elapsed)
      throw new RangeError("Duration cannot end before elapsed time.");
    if (newPlannedDurationMs < this.state.plannedDurationMs)
      throw new RangeError("Duration may only be extended.");
    /*
     * The prior clamp is authoritative: time after it was reached must not
     * become active retroactively merely because overtime is later approved.
     */
    this.state =
      this.state.status === "running"
        ? {
            ...this.state,
            accumulatedActiveMs: elapsed,
            plannedDurationMs: newPlannedDurationMs,
            resumedAtMonotonicMs: this.source.monotonicNowMs(),
            resumedAtWallMs: this.source.wallNowMs(),
          }
        : {
            ...this.state,
            accumulatedActiveMs: elapsed,
            plannedDurationMs: newPlannedDurationMs,
          };
    return elapsed;
  }

  public end(): number {
    const elapsed = this.elapsedMs();
    this.state = {
      ...this.state,
      status: "ended",
      accumulatedActiveMs: elapsed,
    };
    delete (this.state as { resumedAtMonotonicMs?: number }).resumedAtMonotonicMs;
    delete (this.state as { resumedAtWallMs?: number }).resumedAtWallMs;
    return elapsed;
  }

  /** Re-anchor after visibility changes without ever using wall time as truth. */
  public reanchor(): number {
    if (this.state.status !== "running") return this.elapsedMs();
    const elapsed = this.elapsedMs();
    this.state = {
      ...this.state,
      accumulatedActiveMs: elapsed,
      resumedAtMonotonicMs: this.source.monotonicNowMs(),
      resumedAtWallMs: this.source.wallNowMs(),
    };
    return elapsed;
  }

  public snapshot(): MatchClockState {
    const elapsed = this.elapsedMs();
    return this.state.status === "running"
      ? { ...this.state, accumulatedActiveMs: elapsed }
      : cloneState(this.state);
  }

  public journal(): ActiveMatchClockJournal {
    const state = this.snapshot();
    if (state.status !== "running" && state.status !== "paused")
      throw new Error("Only active clocks can be journaled.");
    const journal: ActiveMatchClockJournal = {
      clockStatus: state.status,
      elapsedAtSnapshotMs: state.accumulatedActiveMs,
      snapshotWallMs: this.source.wallNowMs(),
      plannedDurationMs: state.plannedDurationMs,
    };
    if (state.resumedAtWallMs !== undefined)
      return { ...journal, lastResumeWallMs: state.resumedAtWallMs };
    return journal;
  }

  public serialize(): SerializedMatchClock {
    return { state: this.snapshot(), anomalyFlags: [...this.flags].sort() };
  }

  public anomalyFlags(): readonly ClockAnomaly[] {
    return [...this.flags].sort();
  }
}

export type RecoveryOptions = Readonly<{ implausibleGapMs?: number }>;
export type RecoveredClock = Readonly<{ clock: MatchClock; needsReview: boolean }>;

/**
 * On a new page lifecycle monotonic continuity is unavailable. Wall time only
 * estimates a running journal and every uncertainty remains explicit.
 */
export function recoverMatchClock(
  source: ClockSource,
  journal: ActiveMatchClockJournal,
  options: RecoveryOptions = {},
): RecoveredClock {
  finiteNonNegativeInteger(journal.elapsedAtSnapshotMs, "elapsedAtSnapshotMs");
  finiteNonNegativeInteger(journal.plannedDurationMs, "plannedDurationMs");
  const flags: ClockAnomaly[] = [];
  let wallDelta = source.wallNowMs() - journal.snapshotWallMs;
  if (wallDelta < 0) {
    flags.push("wall-clock-regressed");
    wallDelta = 0;
  }
  if (wallDelta > (options.implausibleGapMs ?? 12 * 60 * 60 * 1000))
    flags.push("implausible-recovery-gap");
  const accumulated = integerElapsed(
    Math.min(
      journal.plannedDurationMs,
      journal.elapsedAtSnapshotMs + (journal.clockStatus === "running" ? wallDelta : 0),
    ),
  );
  const state: MatchClockState =
    journal.clockStatus === "running"
      ? {
          status: "running",
          accumulatedActiveMs: accumulated,
          plannedDurationMs: journal.plannedDurationMs,
          resumedAtMonotonicMs: source.monotonicNowMs(),
          resumedAtWallMs: source.wallNowMs(),
        }
      : {
          status: "paused",
          accumulatedActiveMs: accumulated,
          plannedDurationMs: journal.plannedDurationMs,
        };
  return { clock: new MatchClock(source, state, flags), needsReview: flags.length > 0 };
}

export function deserializeMatchClock(
  source: ClockSource,
  serialized: SerializedMatchClock,
): MatchClock {
  const state =
    serialized.state.status === "running"
      ? {
          ...serialized.state,
          resumedAtMonotonicMs: source.monotonicNowMs(),
          resumedAtWallMs: source.wallNowMs(),
        }
      : serialized.state;
  return new MatchClock(source, state, serialized.anomalyFlags);
}
