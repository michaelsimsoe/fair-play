import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { allocateCappedCapacity, allocateRemaining } from "./allocator";
import { type MatchEvent } from "./events";
import { playerId, matchEventId, matchId } from "./ids";
import { planMatch } from "./planner";
import { projectMatch } from "./projection";
import type { MatchConfiguration } from "./types";
import { validateSubstitution } from "./validation";

const ask = playerId("ask");
const ali = playerId("ali");
const fredrik = playerId("fredrik");
const lucas = playerId("lucas");
const players = [ask, ali, fredrik, lucas] as const;
const match = matchId("match");

function event<T extends MatchEvent["type"]>(
  type: T,
  elapsedMs: number,
  sequence: number,
  payload: Extract<MatchEvent, { type: T }>["payload"],
): Extract<MatchEvent, { type: T }> {
  return {
    id: matchEventId(`${type}-${sequence}`),
    matchId: match,
    type,
    elapsedMs,
    sequence,
    recordedAtWallMs: 0,
    source: "user",
    schemaVersion: 1,
    payload,
  } as Extract<MatchEvent, { type: T }>;
}

const configuration: MatchConfiguration = {
  id: match,
  plannedDurationMs: 12 * 60_000,
  playersOnField: 3,
  eligiblePlayerIds: players,
};

const started = event("MATCH_STARTED", 0, 1, {
  starterLineupIds: [ask, ali, fredrik],
  availablePlayerIds: players,
});

describe("projection", () => {
  it("accounts for actual, availability-adjusted ideal, and stints", () => {
    const projection = projectMatch(
      configuration,
      [
        started,
        event("SUBSTITUTION_CONFIRMED", 180_000, 2, {
          outgoingPlayerIds: [ask],
          incomingPlayerIds: [lucas],
        }),
        event("SUBSTITUTION_CONFIRMED", 360_000, 3, {
          outgoingPlayerIds: [ali],
          incomingPlayerIds: [ask],
        }),
        event("SUBSTITUTION_CONFIRMED", 540_000, 4, {
          outgoingPlayerIds: [fredrik],
          incomingPlayerIds: [ali],
        }),
      ],
      { endElapsedMs: 720_000 },
    );

    for (const id of players) {
      expect(projection.actualMsByPlayer[id]).toBe(540_000);
      expect(projection.idealMsByPlayer[id]).toBe(540_000);
      expect(projection.fairnessBalanceMsByPlayer[id]).toBe(0);
    }
    expect(projection.playingStintsByPlayer[ask]).toEqual([
      { startElapsedMs: 0, endElapsedMs: 180_000 },
      { startElapsedMs: 360_000, endElapsedMs: 720_000 },
    ]);
    expect(projection.benchStintsByPlayer[lucas]).toEqual([
      { startElapsedMs: 0, endElapsedMs: 180_000 },
    ]);
  });

  it("orders simultaneous events by sequence and replays corrections", () => {
    const replacement = event("EVENT_REPLACED", 700_000, 10, {
      targetEventId: matchEventId("SUBSTITUTION_CONFIRMED-2"),
      replacement: {
        type: "SUBSTITUTION_CONFIRMED",
        elapsedMs: 120_000,
        payload: { outgoingPlayerIds: [ali], incomingPlayerIds: [lucas] },
      },
    });

    const projection = projectMatch(
      configuration,
      [
        started,
        event("SUBSTITUTION_CONFIRMED", 180_000, 2, {
          outgoingPlayerIds: [ask],
          incomingPlayerIds: [lucas],
        }),
        replacement,
      ],
      { endElapsedMs: 180_000 },
    );
    expect(projection.currentLineupIds).toEqual([ask, fredrik, lucas]);
    expect(projection.actualMsByPlayer[ali]).toBe(120_000);
    expect(projection.actualMsByPlayer[ask]).toBe(180_000);
  });

  it("ignores a voided fact and reports invalid downstream history", () => {
    const projection = projectMatch(
      configuration,
      [
        started,
        event("SUBSTITUTION_CONFIRMED", 180_000, 2, {
          outgoingPlayerIds: [ask],
          incomingPlayerIds: [lucas],
        }),
        event("SUBSTITUTION_CONFIRMED", 360_000, 3, {
          outgoingPlayerIds: [lucas],
          incomingPlayerIds: [ask],
        }),
        event("EVENT_VOIDED", 500_000, 4, {
          targetEventId: matchEventId("SUBSTITUTION_CONFIRMED-2"),
        }),
      ],
      { endElapsedMs: 720_000 },
    );
    expect(projection.currentLineupIds).toEqual([ask, ali, fredrik]);
    expect(
      projection.eventIssues.some((entry) => entry.code === "invalid-substitution"),
    ).toBe(true);
  });

  it("pauses ideal accrual for temporary unavailability", () => {
    const projection = projectMatch(
      configuration,
      [
        started,
        event("PLAYER_AVAILABILITY_CHANGED", 300_000, 2, {
          playerId: lucas,
          available: false,
        }),
        event("PLAYER_AVAILABILITY_CHANGED", 480_000, 3, {
          playerId: lucas,
          available: true,
        }),
      ],
      { endElapsedMs: 720_000 },
    );
    expect(projection.idealMsByPlayer[lucas]).toBe(405_000);
    expect(projection.actualMsByPlayer[ask]).toBe(720_000);
  });

  it("replays batch substitutions, pause/resume, overtime, and end exactly", () => {
    const maria = playerId("maria");
    const shortConfiguration: MatchConfiguration = {
      ...configuration,
      plannedDurationMs: 120_000,
      eligiblePlayerIds: [...players, maria],
    };
    const projection = projectMatch(
      shortConfiguration,
      [
        event("MATCH_STARTED", 0, 1, {
          starterLineupIds: [ask, ali, fredrik],
          availablePlayerIds: [...players, maria],
        }),
        event("SUBSTITUTION_CONFIRMED", 60_000, 2, {
          outgoingPlayerIds: [ask, ali],
          incomingPlayerIds: [lucas, maria],
        }),
        event("MATCH_DURATION_CHANGED", 120_000, 3, { newDurationMs: 180_000 }),
        event("MATCH_PAUSED", 130_000, 4, {}),
        event("MATCH_RESUMED", 130_000, 5, {}),
        event("MATCH_ENDED", 180_000, 6, {}),
      ],
      { endElapsedMs: 180_000 },
    );
    expect(projection.status).toBe("completed");
    expect(projection.elapsedMs).toBe(180_000);
    expect(projection.currentLineupIds).toEqual([fredrik, lucas, maria]);
    expect(
      Object.values(projection.actualMsByPlayer).reduce(
        (total, value) => total + value,
        0,
      ),
    ).toBe(540_000);
    expect(
      Object.values(projection.idealMsByPlayer).reduce(
        (total, value) => total + value,
        0,
      ),
    ).toBe(540_000);
  });

  it("flags duplicate and invalid lineup facts rather than rewriting them", () => {
    const projection = projectMatch(
      configuration,
      [
        event("MATCH_STARTED", 0, 1, {
          starterLineupIds: [ask, ask, ali],
          availablePlayerIds: players,
        }),
        event("LINEUP_SYNCHRONIZED", 60_000, 2, {
          lineupAfterIds: [ask, ali, playerId("not-eligible")],
        }),
      ],
      { endElapsedMs: 120_000 },
    );
    expect(projection.currentLineupIds).toEqual([]);
    expect(
      projection.eventIssues.filter((entry) => entry.code === "invalid-lineup"),
    ).toHaveLength(2);
  });
});

describe("substitution validation", () => {
  it("accepts valid batches and rejects duplicate or inconsistent pairs", () => {
    const maria = playerId("maria");
    expect(
      validateSubstitution(
        [ask, ali, fredrik],
        [...players, maria],
        [ask, ali],
        [lucas, maria],
      ).valid,
    ).toBe(true);
    expect(
      validateSubstitution(
        [ask, ali, fredrik],
        [...players, maria],
        [ask, ali],
        [lucas, lucas],
      ).valid,
    ).toBe(false);
    expect(
      validateSubstitution([ask, ali, fredrik], players, [lucas], [lucas]).valid,
    ).toBe(false);
  });
});

describe("allocator", () => {
  it("breaks equal fractional rounding ties by player order", () => {
    const ids = [playerId("a"), playerId("b"), playerId("c")];
    const [first, second, third] = ids;
    expect(
      allocateRemaining({ [first!]: 0, [second!]: 0, [third!]: 0 }, 1, 2, ids),
    ).toEqual({
      [first!]: 1,
      [second!]: 1,
      [third!]: 0,
    });
  });
  it("preserves exact bounded integer capacity", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }),
        fc.integer({ min: 0, max: 1000 }),
        fc.array(fc.integer({ min: -10_000, max: 10_000 }), {
          minLength: 1,
          maxLength: 8,
        }),
        (fieldSlots, remainingMs, balances) => {
          const ids = balances.map((_, index) => playerId(`p-${index}`));
          fc.pre(fieldSlots <= ids.length);
          const byPlayer = Object.fromEntries(
            ids.map((id, index) => [id, balances[index]!]),
          ) as Record<(typeof ids)[number], number>;
          const result = allocateRemaining(byPlayer, remainingMs, fieldSlots, ids);
          expect(Object.values(result).reduce((sum, value) => sum + value, 0)).toBe(
            fieldSlots * remainingMs,
          );
          ids.forEach((id) => expect(result[id]).toBeGreaterThanOrEqual(0));
          ids.forEach((id) => expect(result[id]).toBeLessThanOrEqual(remainingMs));
        },
      ),
    );
  });

  it("allocates exact five- and six-player targets without losing field time", () => {
    const five = ["p1", "p2", "p3", "p4", "p5"].map(playerId);
    const six = ["p1", "p2", "p3", "p4", "p5", "p6"].map(playerId);
    const fiveAllocations = allocateRemaining(
      Object.fromEntries(five.map((id) => [id, 0])),
      720_000,
      3,
      five,
    );
    const sixAllocations = allocateRemaining(
      Object.fromEntries(six.map((id) => [id, 0])),
      720_000,
      3,
      six,
    );
    expect(Object.values(fiveAllocations)).toEqual([
      432_000, 432_000, 432_000, 432_000, 432_000,
    ]);
    expect(
      Object.values(fiveAllocations).reduce((total, value) => total + value, 0),
    ).toBe(2_160_000);
    expect(Object.values(sixAllocations)).toEqual([
      360_000, 360_000, 360_000, 360_000, 360_000, 360_000,
    ]);
    expect(
      Object.values(sixAllocations).reduce((total, value) => total + value, 0),
    ).toBe(2_160_000);
  });

  it("preserves feasible arbitrary per-player future caps", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 8 }),
        fc.integer({ min: 1, max: 10_000 }),
        fc.array(fc.integer({ min: -100_000, max: 100_000 }), {
          minLength: 2,
          maxLength: 8,
        }),
        fc.array(fc.integer({ min: 0, max: 10_000 }), {
          minLength: 2,
          maxLength: 8,
        }),
        (playerCount, remainingMs, balances, caps) => {
          const ids = Array.from({ length: playerCount }, (_, index) =>
            playerId(`capped-${index}`),
          );
          const fieldSlots = Math.max(1, Math.min(playerCount - 1, 3));
          const capacity = fieldSlots * remainingMs;
          const maximums = Object.fromEntries(
            ids.map((id, index) => [
              id,
              Math.min(remainingMs, caps[index % caps.length]!),
            ]),
          ) as Record<(typeof ids)[number], number>;
          fc.pre(
            Object.values(maximums).reduce((sum, value) => sum + value, 0) >= capacity,
          );
          const result = allocateCappedCapacity(
            Object.fromEntries(
              ids.map((id, index) => [id, balances[index % balances.length]!]),
            ),
            capacity,
            maximums,
            remainingMs,
            ids,
          );
          expect(result.capsFeasible).toBe(true);
          expect(
            Object.values(result.allocationMsByPlayer).reduce(
              (sum, value) => sum + value,
              0,
            ),
          ).toBe(capacity);
          ids.forEach((id) =>
            expect(result.allocationMsByPlayer[id]).toBeLessThanOrEqual(maximums[id]!),
          );
        },
      ),
      { numRuns: 200 },
    );
  });

  it("relaxes infeasible caps by only the capacity shortfall", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 8 }),
        fc.integer({ min: 1, max: 10_000 }),
        fc.array(fc.integer({ min: -100_000, max: 100_000 }), {
          minLength: 2,
          maxLength: 8,
        }),
        fc.array(fc.integer({ min: 0, max: 10_000 }), {
          minLength: 2,
          maxLength: 8,
        }),
        (playerCount, remainingMs, balances, caps) => {
          const ids = Array.from({ length: playerCount }, (_, index) =>
            playerId(`relaxed-${index}`),
          );
          const fieldSlots = Math.max(1, Math.min(playerCount - 1, 3));
          const capacity = fieldSlots * remainingMs;
          const maximums = Object.fromEntries(
            ids.map((id, index) => [
              id,
              Math.min(remainingMs, caps[index % caps.length]!),
            ]),
          ) as Record<(typeof ids)[number], number>;
          const cappedCapacity = Object.values(maximums).reduce(
            (sum, value) => sum + value,
            0,
          );
          fc.pre(cappedCapacity < capacity);
          const result = allocateCappedCapacity(
            Object.fromEntries(
              ids.map((id, index) => [id, balances[index % balances.length]!]),
            ),
            capacity,
            maximums,
            remainingMs,
            ids,
          );
          expect(result.capsFeasible).toBe(false);
          expect(
            result.capRelaxations.reduce(
              (sum, relaxation) => sum + relaxation.exceededMs,
              0,
            ),
          ).toBe(capacity - cappedCapacity);
          ids.forEach((id) =>
            expect(result.allocationMsByPlayer[id]).toBeLessThanOrEqual(remainingMs),
          );
        },
      ),
      { numRuns: 200 },
    );
  });

  it("gives unavoidable cap relaxation to the least-over-target players first", () => {
    const ids = [
      playerId("ahead"),
      playerId("behind"),
      playerId("even"),
      playerId("capped"),
    ];
    const [ahead, behind, even, capped] = ids;
    const result = allocateCappedCapacity(
      { [ahead!]: 10_000, [behind!]: -10_000, [even!]: 0, [capped!]: 0 },
      180_000,
      { [ahead!]: 0, [behind!]: 0, [even!]: 0, [capped!]: 60_000 },
      60_000,
      ids,
    );

    expect(result.capRelaxations).toEqual([
      { playerId: ahead, maximumMs: 0, allocatedMs: 30_000, exceededMs: 30_000 },
      { playerId: behind, maximumMs: 0, allocatedMs: 50_000, exceededMs: 50_000 },
      { playerId: even, maximumMs: 0, allocatedMs: 40_000, exceededMs: 40_000 },
    ]);
  });
});

describe("planner", () => {
  const planning = (
    nowElapsedMs: number,
    lineup: readonly (typeof players)[number][],
    balances: Record<(typeof players)[number], number>,
  ) =>
    planMatch({
      nowElapsedMs,
      plannedEndElapsedMs: 720_000,
      fieldSlots: 3,
      orderedAvailablePlayerIds: players,
      currentLineupIds: lineup,
      balancesMsByPlayer: balances,
      currentFieldStintMsByPlayer: Object.fromEntries(
        players.map((id) => [id, lineup.includes(id) ? 180_000 : 0]),
      ),
      currentBenchStintMsByPlayer: Object.fromEntries(
        players.map((id) => [id, lineup.includes(id) ? 0 : 180_000]),
      ),
      minimumPreferredStintMs: 60_000,
      preferredChangeIntervalMs: 180_000,
    });

  it("creates the required four-player cyclic sequence", () => {
    const first = planning(0, [ask, ali, fredrik], {
      [ask]: 0,
      [ali]: 0,
      [fredrik]: 0,
      [lucas]: 0,
    });
    expect(first.recommendation?.dueAtElapsedMs).toBe(180_000);
    expect(first.recommendation?.swaps).toEqual([
      { outgoingPlayerId: ask, incomingPlayerId: lucas },
    ]);

    const second = planning(180_000, [lucas, ali, fredrik], {
      [ask]: 45_000,
      [ali]: 45_000,
      [fredrik]: 45_000,
      [lucas]: -135_000,
    });
    expect(second.recommendation?.dueAtElapsedMs).toBe(360_000);
    expect(second.recommendation?.swaps).toEqual([
      { outgoingPlayerId: ali, incomingPlayerId: ask },
    ]);

    const third = planning(360_000, [lucas, ask, fredrik], {
      [ask]: -90_000,
      [ali]: 90_000,
      [fredrik]: 90_000,
      [lucas]: -90_000,
    });
    expect(third.recommendation?.dueAtElapsedMs).toBe(540_000);
    expect(third.recommendation?.swaps).toEqual([
      { outgoingPlayerId: fredrik, incomingPlayerId: ali },
    ]);
  });

  it("creates practical deterministic opening sequences for five and six players", () => {
    const five = [
      playerId("p1"),
      playerId("p2"),
      playerId("p3"),
      playerId("p4"),
      playerId("p5"),
    ];
    const six = [...five, playerId("p6")];
    const planFor = (ids: readonly (typeof five)[number][]) =>
      planMatch({
        nowElapsedMs: 0,
        plannedEndElapsedMs: 720_000,
        fieldSlots: 3,
        orderedAvailablePlayerIds: ids,
        currentLineupIds: ids.slice(0, 3),
        balancesMsByPlayer: Object.fromEntries(ids.map((id) => [id, 0])),
        currentFieldStintMsByPlayer: Object.fromEntries(ids.map((id) => [id, 0])),
        currentBenchStintMsByPlayer: Object.fromEntries(ids.map((id) => [id, 0])),
        minimumPreferredStintMs: 60_000,
      });
    const fivePlan = planFor(five);
    expect(fivePlan.preview.slice(0, 2).map((step) => step.dueAtElapsedMs)).toEqual([
      144_000, 288_000,
    ]);
    expect(fivePlan.preview.slice(0, 2).map((step) => step.swaps)).toEqual([
      [{ outgoingPlayerId: five[0]!, incomingPlayerId: five[3]! }],
      [{ outgoingPlayerId: five[1]!, incomingPlayerId: five[4]! }],
    ]);
    const sixPlan = planFor(six);
    expect(sixPlan.preview.slice(0, 2).map((step) => step.dueAtElapsedMs)).toEqual([
      120_000, 240_000,
    ]);
    expect(sixPlan.preview.slice(0, 2).map((step) => step.swaps)).toEqual([
      [{ outgoingPlayerId: six[0]!, incomingPlayerId: six[3]! }],
      [{ outgoingPlayerId: six[1]!, incomingPlayerId: six[4]! }],
    ]);
  });

  it("does not recommend a change when every available player is on field", () => {
    expect(
      planMatch({
        nowElapsedMs: 0,
        plannedEndElapsedMs: 60_000,
        fieldSlots: 3,
        orderedAvailablePlayerIds: [ask, ali, fredrik],
        currentLineupIds: [ask, ali, fredrik],
        balancesMsByPlayer: { [ask]: 0, [ali]: 0, [fredrik]: 0 },
        currentFieldStintMsByPlayer: { [ask]: 0, [ali]: 0, [fredrik]: 0 },
        currentBenchStintMsByPlayer: { [ask]: 0, [ali]: 0, [fredrik]: 0 },
        minimumPreferredStintMs: 60_000,
      }).recommendation,
    ).toBeUndefined();
  });

  it("uses the actual late 03:27 fact and exposes the best infeasible outcome", () => {
    const projection = projectMatch(
      configuration,
      [
        started,
        event("SUBSTITUTION_CONFIRMED", 207_000, 2, {
          outgoingPlayerIds: [ask],
          incomingPlayerIds: [lucas],
        }),
      ],
      { endElapsedMs: 207_000 },
    );
    const result = planMatch({
      nowElapsedMs: 207_000,
      plannedEndElapsedMs: 720_000,
      fieldSlots: 3,
      orderedAvailablePlayerIds: players,
      currentLineupIds: projection.currentLineupIds,
      balancesMsByPlayer: projection.fairnessBalanceMsByPlayer,
      currentFieldStintMsByPlayer: {
        [ask]: 0,
        [ali]: 207_000,
        [fredrik]: 207_000,
        [lucas]: 0,
      },
      currentBenchStintMsByPlayer: { [ask]: 0, [ali]: 0, [fredrik]: 0, [lucas]: 0 },
      minimumPreferredStintMs: 60_000,
      preferredChangeIntervalMs: 180_000,
      actualMsByPlayer: projection.actualMsByPlayer,
      idealMsByPlayer: projection.idealMsByPlayer,
    }).recommendation;
    expect(projection.actualMsByPlayer[ask]).toBe(207_000);
    expect(projection.actualMsByPlayer[lucas]).toBe(0);
    expect(result?.diagnostics.perfectTargetFeasible).toBe(false);
    const projectedBalances = result?.projectedBalanceMsByPlayer;
    expect(Math.abs((projectedBalances?.[lucas] ?? 0) + 27_000)).toBeLessThanOrEqual(
      1_000,
    );
    for (const id of [ask, ali, fredrik]) {
      expect(Math.abs((projectedBalances?.[id] ?? 0) - 9_000)).toBeLessThanOrEqual(
        1_000,
      );
    }
  });

  it("replans from a manually changed real lineup and after availability returns", () => {
    const projection = projectMatch(
      configuration,
      [
        started,
        event("SUBSTITUTION_CONFIRMED", 250_000, 2, {
          outgoingPlayerIds: [fredrik],
          incomingPlayerIds: [lucas],
        }),
      ],
      { endElapsedMs: 250_000 },
    );
    const manual = planMatch({
      nowElapsedMs: 250_000,
      plannedEndElapsedMs: 720_000,
      fieldSlots: 3,
      orderedAvailablePlayerIds: players,
      currentLineupIds: projection.currentLineupIds,
      balancesMsByPlayer: projection.fairnessBalanceMsByPlayer,
      currentFieldStintMsByPlayer: {
        [ask]: 250_000,
        [ali]: 250_000,
        [fredrik]: 0,
        [lucas]: 0,
      },
      currentBenchStintMsByPlayer: { [ask]: 0, [ali]: 0, [fredrik]: 0, [lucas]: 0 },
      minimumPreferredStintMs: 60_000,
      preferredChangeIntervalMs: 180_000,
      manualDeviation: true,
    });
    expect(manual.recommendation?.reasons).toContain("manual-deviation");
    expect(manual.preview[0]?.lineupBeforeIds).toEqual([ask, ali, lucas]);

    const unavailable = planMatch({
      nowElapsedMs: 300_000,
      plannedEndElapsedMs: 720_000,
      fieldSlots: 3,
      orderedAvailablePlayerIds: [ask, ali, fredrik],
      currentLineupIds: [ask, ali, fredrik],
      balancesMsByPlayer: { [ask]: 0, [ali]: 0, [fredrik]: 0 },
      currentFieldStintMsByPlayer: { [ask]: 0, [ali]: 0, [fredrik]: 0 },
      currentBenchStintMsByPlayer: { [ask]: 0, [ali]: 0, [fredrik]: 0 },
      minimumPreferredStintMs: 60_000,
      availabilityChanged: true,
    });
    expect(unavailable.recommendation).toBeUndefined();
    expect(
      planning(300_000, [ask, ali, fredrik], {
        [ask]: 0,
        [ali]: 0,
        [fredrik]: 0,
        [lucas]: 0,
      }).recommendation,
    ).toBeDefined();
  });

  it("uses carried balances, including an immediate owed-player recommendation", () => {
    const carried = planning(0, [ali, fredrik, lucas], {
      [ask]: -100_000,
      [ali]: 33_334,
      [fredrik]: 33_333,
      [lucas]: 33_333,
    }).recommendation;
    expect(carried?.swaps[0]?.incomingPlayerId).toBe(ask);

    const immediate = planning(0, [ali, fredrik, lucas], {
      [ask]: -1_000_000,
      [ali]: 333_334,
      [fredrik]: 333_333,
      [lucas]: 333_333,
    }).recommendation;
    expect(immediate?.dueAtElapsedMs).toBe(0);
    expect(immediate?.swaps[0]?.incomingPlayerId).toBe(ask);
  });

  it("emits a deterministic simultaneous batch only when zero-slack players require it", () => {
    const batchPlayers = [
      playerId("p1"),
      playerId("p2"),
      playerId("p3"),
      playerId("p4"),
      playerId("p5"),
    ];
    const result = planMatch({
      nowElapsedMs: 0,
      plannedEndElapsedMs: 720_000,
      fieldSlots: 3,
      orderedAvailablePlayerIds: batchPlayers,
      currentLineupIds: batchPlayers.slice(0, 3),
      balancesMsByPlayer: {
        [batchPlayers[0]!]: -100,
        [batchPlayers[1]!]: 1_000_000,
        [batchPlayers[2]!]: 1_000_000,
        [batchPlayers[3]!]: -1_000_000,
        [batchPlayers[4]!]: -1_000_000,
      },
      currentFieldStintMsByPlayer: Object.fromEntries(
        batchPlayers.map((id) => [id, 0]),
      ),
      currentBenchStintMsByPlayer: Object.fromEntries(
        batchPlayers.map((id) => [id, 0]),
      ),
      minimumPreferredStintMs: 60_000,
    });
    expect(result.recommendation?.dueAtElapsedMs).toBe(0);
    expect(result.recommendation?.swaps).toEqual([
      { outgoingPlayerId: batchPlayers[1], incomingPlayerId: batchPlayers[3] },
      { outgoingPlayerId: batchPlayers[2], incomingPlayerId: batchPlayers[4] },
    ]);
    expect(result.preview[0]?.lineupAfterIds).toEqual([
      batchPlayers[0],
      batchPlayers[3],
      batchPlayers[4],
    ]);
  });

  it("suppresses an optional near-end micro-stint but permits a forced short one", () => {
    const optional = planMatch({
      nowElapsedMs: 690_000,
      plannedEndElapsedMs: 720_000,
      fieldSlots: 3,
      orderedAvailablePlayerIds: players,
      currentLineupIds: [ask, ali, fredrik],
      balancesMsByPlayer: { [ask]: 0, [ali]: 0, [fredrik]: 0, [lucas]: 0 },
      currentFieldStintMsByPlayer: {
        [ask]: 60_000,
        [ali]: 60_000,
        [fredrik]: 60_000,
        [lucas]: 0,
      },
      currentBenchStintMsByPlayer: {
        [ask]: 0,
        [ali]: 0,
        [fredrik]: 0,
        [lucas]: 60_000,
      },
      minimumPreferredStintMs: 60_000,
    });
    expect(optional.recommendation).toBeUndefined();

    const forced = planMatch({
      nowElapsedMs: 690_000,
      plannedEndElapsedMs: 720_000,
      fieldSlots: 3,
      orderedAvailablePlayerIds: players,
      currentLineupIds: [ask, ali, fredrik],
      balancesMsByPlayer: {
        [ask]: 30_000,
        [ali]: 30_000,
        [fredrik]: 30_000,
        [lucas]: -90_000,
      },
      currentFieldStintMsByPlayer: {
        [ask]: 60_000,
        [ali]: 60_000,
        [fredrik]: 60_000,
        [lucas]: 0,
      },
      currentBenchStintMsByPlayer: {
        [ask]: 0,
        [ali]: 0,
        [fredrik]: 0,
        [lucas]: 60_000,
      },
      minimumPreferredStintMs: 60_000,
    });
    expect(forced.recommendation?.dueAtElapsedMs).toBe(690_000);
    expect(forced.recommendation?.swaps[0]?.incomingPlayerId).toBe(lucas);
  });

  it("is deterministic and produces only valid preview lineups", () => {
    const input = {
      nowElapsedMs: 0,
      plannedEndElapsedMs: 720_000,
      fieldSlots: 3,
      orderedAvailablePlayerIds: players,
      currentLineupIds: [ask, ali, fredrik],
      balancesMsByPlayer: { [ask]: 0, [ali]: 0, [fredrik]: 0, [lucas]: 0 },
      currentFieldStintMsByPlayer: { [ask]: 0, [ali]: 0, [fredrik]: 0, [lucas]: 0 },
      currentBenchStintMsByPlayer: { [ask]: 0, [ali]: 0, [fredrik]: 0, [lucas]: 0 },
      minimumPreferredStintMs: 60_000,
      preferredChangeIntervalMs: 180_000,
    };
    const first = planMatch(input);
    expect(planMatch(input)).toEqual(first);
    for (const step of first.preview) {
      expect(step.lineupAfterIds).toHaveLength(3);
      expect(new Set(step.lineupAfterIds).size).toBe(3);
      expect(step.lineupAfterIds.every((id) => players.includes(id))).toBe(true);
    }
  });

  it("gives a guest their match target before allocating team compensation", () => {
    const team = ["team-a", "team-b", "team-c", "team-d"].map(playerId);
    const guest = playerId("guest");
    const ids = [...team, guest];
    const result = planMatch({
      nowElapsedMs: 0,
      plannedEndElapsedMs: 120_000,
      fieldSlots: 3,
      orderedAvailablePlayerIds: ids,
      currentLineupIds: team.slice(0, 3),
      balancesMsByPlayer: {
        [team[0]!]: -1_000_000,
        [team[1]!]: 1_000_000,
        [team[2]!]: 1_000_000,
        [team[3]!]: 1_000_000,
        [guest]: 9_000_000,
      },
      matchOnlyPlayerIds: [guest],
      currentMatchBalancesMsByPlayer: Object.fromEntries(ids.map((id) => [id, 0])),
      actualMsByPlayer: Object.fromEntries(ids.map((id) => [id, 0])),
      idealMsByPlayer: Object.fromEntries(ids.map((id) => [id, 0])),
      currentFieldStintMsByPlayer: Object.fromEntries(ids.map((id) => [id, 0])),
      currentBenchStintMsByPlayer: Object.fromEntries(ids.map((id) => [id, 0])),
      minimumPreferredStintMs: 1,
    }).recommendation;

    expect(result).toBeDefined();
    expect(result?.projectedActualMsByPlayer[guest]).toBe(72_000);
    expect(result?.projectedIdealMsByPlayer[guest]).toBe(72_000);
    expect(result?.projectedBalanceMsByPlayer[guest]).toBe(0);
    expect(result?.projectedActualMsByPlayer[team[0]!]).toBe(120_000);
    expect(
      team.reduce(
        (total, id) => total + (result?.projectedActualMsByPlayer[id] ?? 0),
        0,
      ),
    ).toBe(288_000);
    expect(
      Object.values(result?.projectedActualMsByPlayer ?? {}).reduce(
        (total, value) => total + value,
        0,
      ),
    ).toBe(360_000);
  });

  it("ignores a guest's carried balance in later match planning", () => {
    const team = ["team-a", "team-b", "team-c", "team-d"].map(playerId);
    const guest = playerId("guest");
    const ids = [...team, guest];
    const input = {
      nowElapsedMs: 0,
      plannedEndElapsedMs: 120_000,
      fieldSlots: 3,
      orderedAvailablePlayerIds: ids,
      currentLineupIds: team.slice(0, 3),
      matchOnlyPlayerIds: [guest],
      currentMatchBalancesMsByPlayer: Object.fromEntries(ids.map((id) => [id, 0])),
      currentFieldStintMsByPlayer: Object.fromEntries(ids.map((id) => [id, 0])),
      currentBenchStintMsByPlayer: Object.fromEntries(ids.map((id) => [id, 0])),
      minimumPreferredStintMs: 1,
    };
    const lowGuestBalance = planMatch({
      ...input,
      balancesMsByPlayer: {
        [team[0]!]: -100_000,
        [team[1]!]: 40_000,
        [team[2]!]: 30_000,
        [team[3]!]: 30_000,
        [guest]: -9_000_000,
      },
    });
    const highGuestBalance = planMatch({
      ...input,
      balancesMsByPlayer: {
        [team[0]!]: -100_000,
        [team[1]!]: 40_000,
        [team[2]!]: 30_000,
        [team[3]!]: 30_000,
        [guest]: 9_000_000,
      },
    });

    expect(highGuestBalance).toEqual(lowGuestBalance);
  });

  it("does not let an unavailable guest consume match capacity", () => {
    const guest = playerId("guest");
    const result = planMatch({
      nowElapsedMs: 0,
      plannedEndElapsedMs: 120_000,
      fieldSlots: 3,
      orderedAvailablePlayerIds: [ask, ali, fredrik],
      currentLineupIds: [ask, ali, fredrik],
      balancesMsByPlayer: { [ask]: 0, [ali]: 0, [fredrik]: 0, [guest]: -9_000_000 },
      matchOnlyPlayerIds: [guest],
      currentMatchBalancesMsByPlayer: {
        [ask]: 0,
        [ali]: 0,
        [fredrik]: 0,
        [guest]: -9_000_000,
      },
      currentFieldStintMsByPlayer: { [ask]: 0, [ali]: 0, [fredrik]: 0 },
      currentBenchStintMsByPlayer: { [ask]: 0, [ali]: 0, [fredrik]: 0 },
      minimumPreferredStintMs: 60_000,
    });

    expect(result.recommendation).toBeUndefined();
    expect(result.preview).toEqual([]);
  });

  it("suppresses a tolerated sub-minimum catch-up stint", () => {
    const result = planMatch({
      nowElapsedMs: 0,
      plannedEndElapsedMs: 120_000,
      fieldSlots: 3,
      orderedAvailablePlayerIds: players,
      currentLineupIds: [ask, ali, fredrik],
      balancesMsByPlayer: {
        [ask]: -20_000,
        [ali]: -20_000,
        [fredrik]: -20_000,
        [lucas]: 60_000,
      },
      currentMatchBalancesMsByPlayer: {
        [ask]: -20_000,
        [ali]: -20_000,
        [fredrik]: -20_000,
        [lucas]: 60_000,
      },
      currentFieldStintMsByPlayer: {
        [ask]: 60_000,
        [ali]: 60_000,
        [fredrik]: 60_000,
        [lucas]: 0,
      },
      currentBenchStintMsByPlayer: {
        [ask]: 0,
        [ali]: 0,
        [fredrik]: 0,
        [lucas]: 60_000,
      },
      minimumPreferredStintMs: 60_000,
      compensationToleranceMs: 30_000,
    });

    expect(result.recommendation).toBeUndefined();
  });

  it("keeps a larger than tolerated current-match difference actionable", () => {
    const result = planMatch({
      nowElapsedMs: 0,
      plannedEndElapsedMs: 30_000,
      fieldSlots: 3,
      orderedAvailablePlayerIds: players,
      currentLineupIds: [ask, ali, fredrik],
      balancesMsByPlayer: {
        [ask]: 13_333.333,
        [ali]: 13_333.333,
        [fredrik]: 13_333.334,
        [lucas]: -40_000,
      },
      currentMatchBalancesMsByPlayer: {
        [ask]: 13_333.333,
        [ali]: 13_333.333,
        [fredrik]: 13_333.334,
        [lucas]: -40_000,
      },
      actualMsByPlayer: {
        [ask]: 13_333.333,
        [ali]: 13_333.333,
        [fredrik]: 13_333.334,
        [lucas]: 0,
      },
      idealMsByPlayer: { [ask]: 0, [ali]: 0, [fredrik]: 0, [lucas]: 40_000 },
      currentFieldStintMsByPlayer: {
        [ask]: 60_000,
        [ali]: 60_000,
        [fredrik]: 60_000,
        [lucas]: 0,
      },
      currentBenchStintMsByPlayer: {
        [ask]: 0,
        [ali]: 0,
        [fredrik]: 0,
        [lucas]: 60_000,
      },
      minimumPreferredStintMs: 60_000,
      compensationToleranceMs: 30_000,
    }).recommendation;

    expect(result?.dueAtElapsedMs).toBe(0);
    expect(result?.diagnostics.perfectTargetFeasible).toBe(false);
    expect(result?.diagnostics.currentMatchDifferencesWithinTolerance).toBe(false);
    expect(result?.diagnostics.maximumAbsoluteCurrentMatchDifferenceMs).toBeGreaterThan(
      30_000,
    );
  });

  it("preserves capacity and bounds across randomized guest/team inputs", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 8 }),
        fc.integer({ min: 1, max: 20_000 }),
        fc.array(fc.boolean(), { minLength: 2, maxLength: 8 }),
        fc.array(fc.integer({ min: -100_000, max: 100_000 }), {
          minLength: 2,
          maxLength: 8,
        }),
        (playerCount, remainingMs, guestFlags, balances) => {
          const ids = Array.from({ length: playerCount }, (_, index) =>
            playerId(`mixed-${index}`),
          );
          const fieldSlots = Math.max(1, Math.min(playerCount - 1, 3));
          const isGuest = ids.filter(
            (_, index) => guestFlags[index % guestFlags.length],
          );
          const result = planMatch({
            nowElapsedMs: 0,
            plannedEndElapsedMs: remainingMs,
            fieldSlots,
            orderedAvailablePlayerIds: ids,
            currentLineupIds: ids.slice(0, fieldSlots),
            balancesMsByPlayer: Object.fromEntries(
              ids.map((id, index) => [id, balances[index % balances.length]!]),
            ),
            matchOnlyPlayerIds: isGuest,
            currentMatchBalancesMsByPlayer: Object.fromEntries(
              ids.map((id, index) => [id, balances[(index + 1) % balances.length]!]),
            ),
            actualMsByPlayer: Object.fromEntries(ids.map((id) => [id, 0])),
            idealMsByPlayer: Object.fromEntries(ids.map((id) => [id, 0])),
            currentFieldStintMsByPlayer: Object.fromEntries(ids.map((id) => [id, 0])),
            currentBenchStintMsByPlayer: Object.fromEntries(ids.map((id) => [id, 0])),
            minimumPreferredStintMs: 1,
          }).recommendation;
          expect(result).toBeDefined();
          const allocations = Object.values(result?.projectedActualMsByPlayer ?? {});
          expect(allocations.reduce((sum, value) => sum + value, 0)).toBe(
            fieldSlots * remainingMs,
          );
          allocations.forEach((value) => {
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(remainingMs);
          });
        },
      ),
      { numRuns: 200 },
    );
  });

  it("prefers a rested bench player over one just substituted out", () => {
    const rested = playerId("rested");
    const justSubbedOut = playerId("just-subbed-out");
    const ids = [ask, ali, fredrik, justSubbedOut, rested];
    const result = planMatch({
      nowElapsedMs: 0,
      plannedEndElapsedMs: 120_000,
      fieldSlots: 3,
      orderedAvailablePlayerIds: ids,
      currentLineupIds: [ask, ali, fredrik],
      balancesMsByPlayer: Object.fromEntries(ids.map((id) => [id, 0])),
      actualMsByPlayer: Object.fromEntries(ids.map((id) => [id, 60_000])),
      idealMsByPlayer: Object.fromEntries(ids.map((id) => [id, 60_000])),
      currentFieldStintMsByPlayer: {
        [ask]: 60_000,
        [ali]: 60_000,
        [fredrik]: 60_000,
        [justSubbedOut]: 0,
        [rested]: 0,
      },
      currentBenchStintMsByPlayer: {
        [ask]: 0,
        [ali]: 0,
        [fredrik]: 0,
        [justSubbedOut]: 0,
        [rested]: 60_000,
      },
      minimumPreferredStintMs: 1,
      minimumPreferredBenchRestMs: 60_000,
    }).recommendation;

    expect(result?.swaps[0]?.incomingPlayerId).toBe(rested);
  });

  it("waits for the only benched player to rest when the allocation permits", () => {
    const recentlyOutgoing = playerId("recently-outgoing");
    const ids = [ask, ali, fredrik, recentlyOutgoing];
    const result = planMatch({
      nowElapsedMs: 0,
      plannedEndElapsedMs: 120_000,
      fieldSlots: 3,
      orderedAvailablePlayerIds: ids,
      currentLineupIds: [ask, ali, fredrik],
      balancesMsByPlayer: {
        [ask]: -13_334,
        [ali]: -13_333,
        [fredrik]: -13_333,
        [recentlyOutgoing]: 40_000,
      },
      actualMsByPlayer: Object.fromEntries(ids.map((id) => [id, 60_000])),
      idealMsByPlayer: Object.fromEntries(ids.map((id) => [id, 60_000])),
      currentFieldStintMsByPlayer: {
        [ask]: 60_000,
        [ali]: 60_000,
        [fredrik]: 60_000,
        [recentlyOutgoing]: 0,
      },
      currentBenchStintMsByPlayer: {
        [ask]: 0,
        [ali]: 0,
        [fredrik]: 0,
        [recentlyOutgoing]: 0,
      },
      minimumPreferredStintMs: 1,
      minimumPreferredBenchRestMs: 60_000,
    }).recommendation;

    expect(result?.dueAtElapsedMs).toBe(60_000);
    expect(result?.swaps[0]?.incomingPlayerId).toBe(recentlyOutgoing);
  });

  it("allows a forced fairness entry before the preferred bench rest", () => {
    const recentlyOutgoing = playerId("recently-outgoing");
    const ids = [ask, ali, fredrik, recentlyOutgoing];
    const result = planMatch({
      nowElapsedMs: 0,
      plannedEndElapsedMs: 30_000,
      fieldSlots: 3,
      orderedAvailablePlayerIds: ids,
      currentLineupIds: [ask, ali, fredrik],
      balancesMsByPlayer: {
        [ask]: 33_333,
        [ali]: 33_333,
        [fredrik]: 33_334,
        [recentlyOutgoing]: -100_000,
      },
      actualMsByPlayer: Object.fromEntries(ids.map((id) => [id, 60_000])),
      idealMsByPlayer: Object.fromEntries(ids.map((id) => [id, 60_000])),
      currentFieldStintMsByPlayer: {
        [ask]: 60_000,
        [ali]: 60_000,
        [fredrik]: 60_000,
        [recentlyOutgoing]: 0,
      },
      currentBenchStintMsByPlayer: {
        [ask]: 0,
        [ali]: 0,
        [fredrik]: 0,
        [recentlyOutgoing]: 0,
      },
      minimumPreferredStintMs: 1,
      minimumPreferredBenchRestMs: 60_000,
    }).recommendation;

    expect(result?.dueAtElapsedMs).toBe(0);
    expect(result?.swaps[0]?.incomingPlayerId).toBe(recentlyOutgoing);
  });

  it("limits a returning team player's large carried debt to one minute above target", () => {
    const returning = ask;
    const normalMatchTargetMs = 540_000;
    const maximumFutureActualMs = normalMatchTargetMs + 60_000;
    const plan = (balances: Record<(typeof players)[number], number>) =>
      planMatch({
        nowElapsedMs: 0,
        plannedEndElapsedMs: 720_000,
        fieldSlots: 3,
        orderedAvailablePlayerIds: players,
        currentLineupIds: [ali, fredrik, lucas],
        balancesMsByPlayer: balances,
        maximumFutureActualMsByPlayer: { [returning]: maximumFutureActualMs },
        currentFieldStintMsByPlayer: { [ask]: 0, [ali]: 0, [fredrik]: 0, [lucas]: 0 },
        currentBenchStintMsByPlayer: {
          [ask]: 60_000,
          [ali]: 0,
          [fredrik]: 0,
          [lucas]: 0,
        },
        minimumPreferredStintMs: 60_000,
      });
    const first = plan({
      [ask]: -2_000_000,
      [ali]: 666_667,
      [fredrik]: 666_667,
      [lucas]: 666_666,
    });
    expect(first.recommendation?.projectedActualMsByPlayer[returning]).toBe(
      maximumFutureActualMs,
    );
    expect(first.recommendation?.diagnostics.futureAllocationCaps.capsFeasible).toBe(
      true,
    );

    const second = plan(
      first.recommendation?.projectedBalanceMsByPlayer as Record<
        (typeof players)[number],
        number
      >,
    );
    expect(second.recommendation?.projectedActualMsByPlayer[returning]).toBe(
      maximumFutureActualMs,
    );
  });

  it("fills the field and reports deterministic cap relaxation with no bench", () => {
    const onlyField = [ask, ali, fredrik];
    const result = planMatch({
      nowElapsedMs: 0,
      plannedEndElapsedMs: 60_000,
      fieldSlots: 3,
      orderedAvailablePlayerIds: onlyField,
      currentLineupIds: onlyField,
      balancesMsByPlayer: { [ask]: 10_000, [ali]: -10_000, [fredrik]: 0 },
      maximumFutureActualMsByPlayer: { [ask]: 0, [ali]: 0, [fredrik]: 0 },
      currentFieldStintMsByPlayer: { [ask]: 0, [ali]: 0, [fredrik]: 0 },
      currentBenchStintMsByPlayer: { [ask]: 0, [ali]: 0, [fredrik]: 0 },
      minimumPreferredStintMs: 60_000,
    });

    expect(result.recommendation).toBeUndefined();
    expect(result.diagnostics.futureAllocationCaps).toEqual({
      capsFeasible: false,
      requestedCapacityMs: 0,
      requiredCapacityMs: 180_000,
      allocatedFutureActualMsByPlayer: {
        [ask]: 60_000,
        [ali]: 60_000,
        [fredrik]: 60_000,
      },
      relaxations: [
        {
          playerId: ask,
          maximumFutureActualMs: 0,
          allocatedFutureActualMs: 60_000,
          relaxedByMs: 60_000,
        },
        {
          playerId: ali,
          maximumFutureActualMs: 0,
          allocatedFutureActualMs: 60_000,
          relaxedByMs: 60_000,
        },
        {
          playerId: fredrik,
          maximumFutureActualMs: 0,
          allocatedFutureActualMs: 60_000,
          relaxedByMs: 60_000,
        },
      ],
    });
  });

  it("enforces feasible per-player caps across randomized planner inputs", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 8 }),
        fc.integer({ min: 1, max: 20_000 }),
        fc.array(fc.integer({ min: -100_000, max: 100_000 }), {
          minLength: 2,
          maxLength: 8,
        }),
        fc.array(fc.integer({ min: 0, max: 20_000 }), {
          minLength: 2,
          maxLength: 8,
        }),
        (playerCount, remainingMs, balances, rawCaps) => {
          const ids = Array.from({ length: playerCount }, (_, index) =>
            playerId(`planner-capped-${index}`),
          );
          const fieldSlots = Math.max(1, Math.min(playerCount - 1, 3));
          const capacity = fieldSlots * remainingMs;
          const maximums = ids.map((_, index) =>
            Math.min(remainingMs, rawCaps[index % rawCaps.length]!),
          );
          let missingCapacity = Math.max(
            0,
            capacity - maximums.reduce((sum, maximum) => sum + maximum, 0),
          );
          for (
            let index = 0;
            index < maximums.length && missingCapacity > 0;
            index += 1
          ) {
            const increase = Math.min(remainingMs - maximums[index]!, missingCapacity);
            maximums[index] = maximums[index]! + increase;
            missingCapacity -= increase;
          }
          const caps = Object.fromEntries(
            ids.map((id, index) => [id, maximums[index]!]),
          ) as Record<(typeof ids)[number], number>;
          const result = planMatch({
            nowElapsedMs: 0,
            plannedEndElapsedMs: remainingMs,
            fieldSlots,
            orderedAvailablePlayerIds: ids,
            currentLineupIds: ids.slice(0, fieldSlots),
            balancesMsByPlayer: Object.fromEntries(
              ids.map((id, index) => [id, balances[index % balances.length]!]),
            ),
            maximumFutureActualMsByPlayer: caps,
            currentFieldStintMsByPlayer: Object.fromEntries(ids.map((id) => [id, 0])),
            currentBenchStintMsByPlayer: Object.fromEntries(ids.map((id) => [id, 0])),
            minimumPreferredStintMs: 1,
          });
          const diagnostics = result.diagnostics.futureAllocationCaps;
          expect(diagnostics.capsFeasible).toBe(true);
          expect(
            Object.values(diagnostics.allocatedFutureActualMsByPlayer).reduce(
              (sum, value) => sum + value,
              0,
            ),
          ).toBe(capacity);
          ids.forEach((id) =>
            expect(diagnostics.allocatedFutureActualMsByPlayer[id]).toBeLessThanOrEqual(
              caps[id]!,
            ),
          );
        },
      ),
      { numRuns: 200 },
    );
  });

  it("honors caps when replanning from a manually synchronized lineup", () => {
    const result = planMatch({
      nowElapsedMs: 240_000,
      plannedEndElapsedMs: 720_000,
      fieldSlots: 3,
      orderedAvailablePlayerIds: players,
      currentLineupIds: [ask, ali, lucas],
      balancesMsByPlayer: { [ask]: 0, [ali]: 0, [fredrik]: 0, [lucas]: 0 },
      maximumFutureActualMsByPlayer: { [lucas]: 0 },
      currentFieldStintMsByPlayer: {
        [ask]: 240_000,
        [ali]: 240_000,
        [fredrik]: 0,
        [lucas]: 0,
      },
      currentBenchStintMsByPlayer: {
        [ask]: 0,
        [ali]: 0,
        [fredrik]: 240_000,
        [lucas]: 0,
      },
      minimumPreferredStintMs: 60_000,
      manualDeviation: true,
    });

    expect(result.recommendation?.dueAtElapsedMs).toBe(240_000);
    expect(result.recommendation?.swaps).toContainEqual({
      outgoingPlayerId: lucas,
      incomingPlayerId: fredrik,
    });
    expect(result.recommendation?.projectedActualMsByPlayer[lucas]).toBe(0);
  });
});
