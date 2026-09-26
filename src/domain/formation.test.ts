import { describe, expect, it } from "vitest";
import type { MatchEvent } from "./events";
import {
  formationById,
  formationsFor,
  goalkeeperSlot,
  normalizeRoleAssignments,
  projectRoles,
  rolesAfterSubstitution,
  suggestRoleAssignments,
  swapRoles,
} from "./formation";
import { matchEventId, matchId, playerId } from "./ids";
import { planMatch } from "./planner";

const ids = ["ada", "bo", "cy", "di", "eli", "fin", "gus"].map(playerId);
const [ada, bo, cy, di, eli, fin, gus] = ids as [
  (typeof ids)[number],
  (typeof ids)[number],
  (typeof ids)[number],
  (typeof ids)[number],
  (typeof ids)[number],
  (typeof ids)[number],
  (typeof ids)[number],
];
const diamond = formationById("5-121")!;

function event<T extends MatchEvent["type"]>(
  type: T,
  elapsedMs: number,
  sequence: number,
  payload: Extract<MatchEvent, { type: T }>["payload"],
): Extract<MatchEvent, { type: T }> {
  return {
    id: matchEventId(`${type}-${sequence}`),
    matchId: matchId("m"),
    type,
    elapsedMs,
    sequence,
    recordedAtWallMs: 0,
    source: "user",
    schemaVersion: 1,
    payload,
  } as Extract<MatchEvent, { type: T }>;
}

describe("formations", () => {
  it("offers templates for 5-, 7-, 9- and 11-a-side with one keeper each", () => {
    for (const size of [5, 7, 9, 11]) {
      const formations = formationsFor(size);
      expect(formations.length).toBeGreaterThan(0);
      for (const formation of formations) {
        expect(formation.slots).toHaveLength(size);
        expect(formation.slots.filter((slot) => slot.family === "GK")).toHaveLength(1);
        expect(new Set(formation.slots.map((slot) => slot.id)).size).toBe(size);
      }
    }
    const threes = formationsFor(3);
    expect(threes.length).toBeGreaterThan(0);
    for (const formation of threes) {
      expect(formation.slots).toHaveLength(3);
      expect(goalkeeperSlot(formation)).toBeUndefined();
    }
  });

  it("never suggests an unwilling keeper when a willing child starts", () => {
    const assignments = suggestRoleAssignments(diamond, [ada, bo, cy, di, eli], {
      goalkeeperPreferenceByPlayer: { [ada]: "unavailable", [bo]: "prefer-not" },
      exposure: { [cy]: { GK: 120_000 } },
    });
    expect(assignments.find((a) => a.roleSlotId === "gk")?.playerId).toBe(di);
    expect(new Set(assignments.map((a) => a.playerId)).size).toBe(5);
  });

  it("leans each child towards the position family they have played least", () => {
    const assignments = suggestRoleAssignments(diamond, [ada, bo, cy, di, eli], {
      preferredGoalkeeperId: ada,
      exposure: {
        [bo]: { FWD: 300_000 },
        [cy]: { DEF: 300_000 },
      },
    });
    const slotOf = (id: string) =>
      diamond.slots.find(
        (slot) =>
          slot.id ===
          assignments.find((assignment) => assignment.playerId === id)?.roleSlotId,
      )?.family;
    expect(slotOf(ada)).toBe("GK");
    expect(slotOf(bo)).not.toBe("FWD");
    expect(slotOf(cy)).not.toBe("DEF");
  });

  it("lets the incoming child inherit the outgoing child's slot", () => {
    const before = normalizeRoleAssignments(diamond, [ada, bo, cy, di, eli]);
    const change = rolesAfterSubstitution(diamond, before, [
      { outgoingPlayerId: cy, incomingPlayerId: fin },
    ]);
    expect(change.moves).toEqual([]);
    expect(change.assignments.find((a) => a.playerId === fin)?.roleSlotId).toBe(
      before.find((a) => a.playerId === cy)?.roleSlotId,
    );
  });

  it("moves at most one willing child into goal instead of an unwilling incoming child", () => {
    const before = normalizeRoleAssignments(diamond, [ada, bo, cy, di, eli]);
    expect(before[0]).toEqual({ roleSlotId: "gk", playerId: ada });
    const change = rolesAfterSubstitution(
      diamond,
      before,
      [{ outgoingPlayerId: ada, incomingPlayerId: fin }],
      { goalkeeperPreferenceByPlayer: { [fin]: "unavailable", [bo]: "prefer-not" } },
    );
    expect(change.moves).toEqual([
      { playerId: cy, fromRoleSlotId: "lw", toRoleSlotId: "gk" },
    ]);
    expect(change.assignments.find((a) => a.playerId === fin)?.roleSlotId).toBe("lw");
    expect(change.goalkeeperWarning).toBe(false);
  });

  it("warns instead of guessing when nobody on the field may stand in goal", () => {
    const before = normalizeRoleAssignments(diamond, [ada, bo, cy, di, eli]);
    const unavailable = Object.fromEntries(
      [bo, cy, di, eli, fin].map((id) => [id, "unavailable" as const]),
    );
    const change = rolesAfterSubstitution(
      diamond,
      before,
      [{ outgoingPlayerId: ada, incomingPlayerId: fin }],
      { goalkeeperPreferenceByPlayer: unavailable },
    );
    expect(change.moves).toEqual([]);
    expect(change.goalkeeperWarning).toBe(true);
  });

  it("swaps two field positions", () => {
    const before = normalizeRoleAssignments(diamond, [ada, bo, cy, di, eli]);
    const after = swapRoles(diamond, before, ada, eli);
    expect(after.find((a) => a.playerId === eli)?.roleSlotId).toBe("gk");
    expect(after.find((a) => a.playerId === ada)?.roleSlotId).toBe("st");
  });

  it("projects slot history and position exposure from the event stream", () => {
    const starters = [ada, bo, cy, di, eli];
    const events: MatchEvent[] = [
      event("MATCH_STARTED", 0, 0, {
        starterLineupIds: starters,
        availablePlayerIds: [...starters, fin],
        plannedDurationMs: 600_000,
        formationId: diamond.id,
        starterRoleAssignments: normalizeRoleAssignments(diamond, starters),
      }),
      event("SUBSTITUTION_CONFIRMED", 120_000, 1, {
        outgoingPlayerIds: [bo],
        incomingPlayerIds: [fin],
      }),
      event("LINEUP_SYNCHRONIZED", 240_000, 2, {
        lineupAfterIds: [ada, fin, cy, di, eli],
        reason: "position-change",
        roleAssignmentsAfter: [
          { roleSlotId: "gk", playerId: eli },
          { roleSlotId: "cb", playerId: fin },
          { roleSlotId: "lw", playerId: cy },
          { roleSlotId: "rw", playerId: di },
          { roleSlotId: "st", playerId: ada },
        ],
      }),
      event("MATCH_ENDED", 600_000, 3, {}),
    ];
    const projection = projectRoles(diamond, events);
    expect(projection.exposureMsByPlayer[ada]).toEqual({ GK: 240_000, FWD: 360_000 });
    expect(projection.exposureMsByPlayer[bo]).toEqual({ DEF: 120_000 });
    expect(projection.exposureMsByPlayer[fin]).toEqual({ DEF: 480_000 });
    expect(projection.exposureMsByPlayer[eli]).toEqual({ FWD: 240_000, GK: 360_000 });
    expect(projection.assignments.find((a) => a.roleSlotId === "gk")?.playerId).toBe(
      eli,
    );
  });
});

describe("locked keeper planning", () => {
  it("keeps a whole-match keeper out of the fixed outfield rotation", () => {
    const available = [ada, bo, cy, di, eli, fin, gus];
    const zeros = Object.fromEntries(available.map((id) => [id, 0]));
    const result = planMatch({
      nowElapsedMs: 0,
      plannedEndElapsedMs: 720_000,
      fieldSlots: 5,
      lockedOnFieldPlayerIds: [ada],
      orderedAvailablePlayerIds: available,
      currentLineupIds: [ada, bo, cy, di, eli],
      balancesMsByPlayer: zeros,
      currentFieldStintMsByPlayer: zeros,
      currentBenchStintMsByPlayer: zeros,
      minimumPreferredStintMs: 60_000,
      fixedSubstitutionRhythmMs: 120_000,
    });
    expect(result.preview.length).toBeGreaterThan(0);
    for (const step of result.preview) {
      expect(step.lineupAfterIds).toContain(ada);
      expect(step.lineupAfterIds).toHaveLength(5);
      for (const swap of step.swaps) {
        expect(swap.outgoingPlayerId).not.toBe(ada);
        expect(swap.incomingPlayerId).not.toBe(ada);
      }
    }
    expect(result.recommendation?.dueAtElapsedMs).toBe(120_000);
  });
});
