import { describe, expect, it } from "vitest";
import { deserializeMatchClock, MatchClock, recoverMatchClock } from "./MatchClock";
import { ThresholdCrossingTracker, thresholdCrossing } from "./alertCrossings";
import type { ClockSource } from "./ClockSource";

class FakeClockSource implements ClockSource {
  public monotonic = 0;
  public wall = 0;
  public monotonicNowMs(): number {
    return this.monotonic;
  }
  public wallNowMs(): number {
    return this.wall;
  }
  public advance(ms: number): void {
    this.monotonic += ms;
    this.wall += ms;
  }
}

describe("MatchClock", () => {
  it("uses monotonic time, pauses, clamps, and explicitly extends overtime", () => {
    const source = new FakeClockSource();
    const clock = MatchClock.idle(source, 1_000);
    clock.start();
    source.advance(900);
    source.wall += 10_000;
    expect(clock.elapsedMs()).toBe(900);
    clock.pause();
    source.advance(5_000);
    expect(clock.elapsedMs()).toBe(900);
    clock.resume();
    source.advance(200);
    expect(clock.elapsedMs()).toBe(1_000);
    clock.extendTo(1_500);
    expect(clock.elapsedMs()).toBe(1_000);
    source.advance(200);
    expect(clock.elapsedMs()).toBe(1_200);
  });

  it("recovers a running journal from wall time and flags anomalies", () => {
    const source = new FakeClockSource();
    const original = MatchClock.idle(source, 1_000);
    original.start();
    source.advance(400);
    const journal = original.journal();
    source.monotonic = 0;
    source.wall += 200;
    const recovered = recoverMatchClock(source, journal);
    expect(recovered.clock.elapsedMs()).toBe(600);
    source.wall = -1;
    const regressed = recoverMatchClock(source, journal);
    expect(regressed.needsReview).toBe(true);
    expect(regressed.clock.anomalyFlags()).toContain("wall-clock-regressed");
  });

  it("serializes a paused clock exactly", () => {
    const source = new FakeClockSource();
    const clock = MatchClock.idle(source, 10_000);
    clock.start();
    source.advance(1234);
    clock.pause();
    expect(clock.serialize().state).toEqual({
      status: "paused",
      accumulatedActiveMs: 1234,
      plannedDurationMs: 10_000,
    });
  });

  it("handles multiple pause/resume cycles and visibility re-anchoring", () => {
    const source = new FakeClockSource();
    const clock = MatchClock.idle(source, 10_000);
    clock.start();
    source.advance(100);
    clock.pause();
    source.advance(500);
    clock.resume();
    source.advance(200);
    clock.pause();
    source.advance(500);
    clock.resume();
    source.advance(300);
    expect(clock.elapsedMs()).toBe(600);
    clock.reanchor();
    source.advance(400);
    expect(clock.elapsedMs()).toBe(1_000);
  });

  it("flags monotonic regression and implausibly large recovery gaps", () => {
    const source = new FakeClockSource();
    const clock = MatchClock.idle(source, 10_000);
    clock.start();
    source.monotonic = -1;
    expect(clock.elapsedMs()).toBe(0);
    expect(clock.anomalyFlags()).toContain("monotonic-clock-regressed");

    source.monotonic = 0;
    source.wall = 0;
    const journal = clock.journal();
    source.wall = 10_001;
    const recovered = recoverMatchClock(source, journal, { implausibleGapMs: 10_000 });
    expect(recovered.needsReview).toBe(true);
    expect(recovered.clock.anomalyFlags()).toContain("implausible-recovery-gap");
  });

  it("deserializes a running snapshot using a fresh monotonic anchor", () => {
    const source = new FakeClockSource();
    const original = MatchClock.idle(source, 10_000);
    original.start();
    source.advance(1_234);
    const serialized = original.serialize();
    source.monotonic = 0;
    const restored = deserializeMatchClock(source, serialized);
    expect(restored.elapsedMs()).toBe(1_234);
    source.advance(321);
    expect(restored.elapsedMs()).toBe(1_555);
  });

  it("floors fractional monotonic elapsed time before journaling and recovering", () => {
    const source = new FakeClockSource();
    source.monotonic = 100.25;
    source.wall = 1_000;
    const clock = MatchClock.idle(source, 10_000);
    clock.start();
    source.monotonic = 223.9;
    source.wall = 1_123;
    expect(clock.elapsedMs()).toBe(123);
    const journal = clock.journal();
    expect(journal.elapsedAtSnapshotMs).toBe(123);
    expect(Number.isInteger(journal.elapsedAtSnapshotMs)).toBe(true);

    source.monotonic = 0.5;
    source.wall = 1_130;
    const recovered = recoverMatchClock(source, journal);
    expect(recovered.clock.elapsedMs()).toBe(130);
    expect(recovered.clock.journal().elapsedAtSnapshotMs).toBe(130);
  });
});

describe("threshold crossings", () => {
  it("fires a threshold once and consolidates skipped thresholds", () => {
    const thresholds = [
      { id: "lead", remainingMs: 100 },
      { id: "due", remainingMs: 0 },
    ];
    expect(thresholdCrossing(101, 100, thresholds).crossedIds).toEqual(["lead"]);
    const tracker = new ThresholdCrossingTracker();
    expect(tracker.observe(200, -1, thresholds)).toEqual({
      crossedIds: ["lead", "due"],
      consolidated: true,
    });
    expect(tracker.observe(10, 0, thresholds).crossedIds).toEqual([]);
  });

  it("does not fire boundaries when remaining time moves away from them", () => {
    const thresholds = [{ id: "end", remainingMs: 0 }];
    expect(thresholdCrossing(0, 10, thresholds)).toEqual({
      crossedIds: [],
      consolidated: false,
    });
    expect(thresholdCrossing(1, 0, thresholds)).toEqual({
      crossedIds: ["end"],
      consolidated: false,
    });
  });
});
