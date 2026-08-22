export type AlertThreshold = Readonly<{ id: string; remainingMs: number }>;
export type ThresholdCrossing = Readonly<{
  crossedIds: readonly string[];
  consolidated: boolean;
}>;

/**
 * Finds newly crossed remaining-time thresholds. Callers persist `crossedIds`
 * in session state; a skipped set produces one consolidated cue.
 */
export function thresholdCrossing(
  previousRemainingMs: number,
  currentRemainingMs: number,
  thresholds: readonly AlertThreshold[],
  alreadyFiredIds: ReadonlySet<string> = new Set(),
): ThresholdCrossing {
  const crossedIds = thresholds
    .filter(
      (threshold) =>
        !alreadyFiredIds.has(threshold.id) &&
        previousRemainingMs > threshold.remainingMs &&
        currentRemainingMs <= threshold.remainingMs,
    )
    .sort((a, b) => b.remainingMs - a.remainingMs || a.id.localeCompare(b.id))
    .map((threshold) => threshold.id);
  return { crossedIds, consolidated: crossedIds.length > 1 };
}

export class ThresholdCrossingTracker {
  private readonly fired = new Set<string>();

  public observe(
    previousRemainingMs: number,
    currentRemainingMs: number,
    thresholds: readonly AlertThreshold[],
  ): ThresholdCrossing {
    const crossing = thresholdCrossing(
      previousRemainingMs,
      currentRemainingMs,
      thresholds,
      this.fired,
    );
    crossing.crossedIds.forEach((id) => this.fired.add(id));
    return crossing;
  }

  public firedIds(): readonly string[] {
    return [...this.fired].sort();
  }
}
