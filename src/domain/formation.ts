import { effectiveEvents, type MatchEvent, type RoleAssignment } from "./events";
import type { PlayerId } from "./ids";

export type PositionFamily = "GK" | "DEF" | "MID" | "FWD";
/** Match formats used in Norwegian children's football. */
export const MATCH_FORMATS = [3, 5, 7, 9, 11] as const;

export const OUTFIELD_FAMILIES: readonly PositionFamily[] = ["DEF", "MID", "FWD"];

export type RoleSlot = Readonly<{
  id: string;
  label: string;
  shortLabel: string;
  family: PositionFamily;
  /** 0 = left touchline, 100 = right touchline. */
  x: number;
  /** 0 = opponent goal, 100 = own goal. */
  y: number;
}>;

export type Formation = Readonly<{
  id: string;
  name: string;
  playersOnField: number;
  slots: readonly RoleSlot[];
}>;

export type GoalkeeperPreference = "willing" | "prefer-not" | "unavailable";
export type GoalkeeperPolicy = "fixed" | "rotating";

const slot = (
  id: string,
  label: string,
  shortLabel: string,
  family: PositionFamily,
  x: number,
  y: number,
): RoleSlot => ({ id, label, shortLabel, family, x, y });

const gk = slot("gk", "Keeper", "K", "GK", 50, 92);
const cb = (y = 70) => slot("cb", "Midtstopper", "MS", "DEF", 50, y);
const lb = (x = 28, y = 70) => slot("lb", "Venstre back", "VB", "DEF", x, y);
const rb = (x = 72, y = 70) => slot("rb", "Høyre back", "HB", "DEF", x, y);
const cm = (y = 45) => slot("cm", "Sentral midtbane", "SM", "MID", 50, y);
const lm = (x = 18, y = 45) => slot("lm", "Venstre midtbane", "VM", "MID", x, y);
const rm = (x = 82, y = 45) => slot("rm", "Høyre midtbane", "HM", "MID", x, y);
const st = (y = 18) => slot("st", "Spiss", "S", "FWD", 50, y);
const ls = (x = 32, y = 18) => slot("ls", "Venstre spiss", "VS", "FWD", x, y);
const rs = (x = 68, y = 18) => slot("rs", "Høyre spiss", "HS", "FWD", x, y);

export const FORMATIONS: readonly Formation[] = [
  {
    id: "3-21",
    name: "3er · 2-1 (trekant)",
    playersOnField: 3,
    slots: [lb(30, 68), rb(70, 68), st(26)],
  },
  {
    id: "3-12",
    name: "3er · 1-2",
    playersOnField: 3,
    slots: [cb(70), ls(30, 28), rs(70, 28)],
  },
  {
    id: "3-111",
    name: "3er · 1-1-1 (linje)",
    playersOnField: 3,
    slots: [cb(74), cm(48), st(22)],
  },
  {
    id: "5-121",
    name: "5er · 1-2-1 (diamant)",
    playersOnField: 5,
    slots: [
      gk,
      cb(72),
      slot("lw", "Venstre kant", "VK", "MID", 20, 45),
      slot("rw", "Høyre kant", "HK", "MID", 80, 45),
      st(18),
    ],
  },
  {
    id: "5-22",
    name: "5er · 2-2",
    playersOnField: 5,
    slots: [gk, lb(30, 66), rb(70, 66), ls(30, 26), rs(70, 26)],
  },
  {
    id: "5-112",
    name: "5er · 1-1-2",
    playersOnField: 5,
    slots: [gk, cb(72), cm(48), ls(30, 20), rs(70, 20)],
  },
  {
    id: "7-231",
    name: "7er · 2-3-1",
    playersOnField: 7,
    slots: [gk, lb(32, 72), rb(68, 72), lm(18, 46), cm(48), rm(82, 46), st(18)],
  },
  {
    id: "7-321",
    name: "7er · 3-2-1",
    playersOnField: 7,
    slots: [
      gk,
      lb(20, 70),
      cb(74),
      rb(80, 70),
      slot("lcm", "Venstre sentral midtbane", "VSM", "MID", 35, 45),
      slot("rcm", "Høyre sentral midtbane", "HSM", "MID", 65, 45),
      st(18),
    ],
  },
  {
    id: "7-312",
    name: "7er · 3-1-2",
    playersOnField: 7,
    slots: [gk, lb(20, 70), cb(74), rb(80, 70), cm(47), ls(32, 20), rs(68, 20)],
  },
  {
    id: "9-323",
    name: "9er · 3-2-3",
    playersOnField: 9,
    slots: [
      gk,
      lb(22, 72),
      cb(75),
      rb(78, 72),
      slot("lcm", "Venstre sentral midtbane", "VSM", "MID", 36, 48),
      slot("rcm", "Høyre sentral midtbane", "HSM", "MID", 64, 48),
      slot("lw", "Venstre kant", "VK", "FWD", 16, 22),
      st(16),
      slot("rw", "Høyre kant", "HK", "FWD", 84, 22),
    ],
  },
  {
    id: "9-332",
    name: "9er · 3-3-2",
    playersOnField: 9,
    slots: [
      gk,
      lb(22, 72),
      cb(75),
      rb(78, 72),
      lm(18, 46),
      cm(48),
      rm(82, 46),
      ls(34, 20),
      rs(66, 20),
    ],
  },
  {
    id: "11-433",
    name: "11er · 4-3-3",
    playersOnField: 11,
    slots: [
      gk,
      lb(14, 70),
      slot("lcb", "Venstre midtstopper", "VMS", "DEF", 38, 76),
      slot("rcb", "Høyre midtstopper", "HMS", "DEF", 62, 76),
      rb(86, 70),
      slot("lcm", "Venstre sentral midtbane", "VSM", "MID", 30, 50),
      cm(54),
      slot("rcm", "Høyre sentral midtbane", "HSM", "MID", 70, 50),
      slot("lw", "Venstre kant", "VK", "FWD", 16, 22),
      st(16),
      slot("rw", "Høyre kant", "HK", "FWD", 84, 22),
    ],
  },
  {
    id: "11-442",
    name: "11er · 4-4-2",
    playersOnField: 11,
    slots: [
      gk,
      lb(14, 70),
      slot("lcb", "Venstre midtstopper", "VMS", "DEF", 38, 76),
      slot("rcb", "Høyre midtstopper", "HMS", "DEF", 62, 76),
      rb(86, 70),
      lm(14, 46),
      slot("lcm", "Venstre sentral midtbane", "VSM", "MID", 38, 48),
      slot("rcm", "Høyre sentral midtbane", "HSM", "MID", 62, 48),
      rm(86, 46),
      ls(36, 18),
      rs(64, 18),
    ],
  },
];

export const POSITION_FAMILY_LABELS: Readonly<Record<PositionFamily, string>> = {
  GK: "Keeper",
  DEF: "Forsvar",
  MID: "Midtbane",
  FWD: "Angrep",
};

export const formationById = (id: string | null | undefined): Formation | undefined =>
  id ? FORMATIONS.find((formation) => formation.id === id) : undefined;

export const formationsFor = (playersOnField: number): readonly Formation[] =>
  FORMATIONS.filter((formation) => formation.playersOnField === playersOnField);

export const goalkeeperSlot = (formation: Formation): RoleSlot | undefined =>
  formation.slots.find((candidate) => candidate.family === "GK");

export const roleSlotById = (
  formation: Formation,
  roleSlotId: string,
): RoleSlot | undefined =>
  formation.slots.find((candidate) => candidate.id === roleSlotId);

export type PositionExposure = Readonly<
  Record<PlayerId, Readonly<Partial<Record<PositionFamily, number>>>>
>;

const exposureOf = (
  exposure: PositionExposure,
  id: PlayerId,
  family: PositionFamily,
): number => exposure[id]?.[family] ?? 0;

const preferenceRank = (preference: GoalkeeperPreference | undefined): number =>
  preference === "prefer-not" ? 1 : preference === "unavailable" ? 2 : 0;

export type GoalkeeperContext = Readonly<{
  goalkeeperPreferenceByPlayer?: Readonly<
    Partial<Record<PlayerId, GoalkeeperPreference>>
  >;
  exposure?: PositionExposure;
}>;

/** Deterministic keeper choice: willingness first, then least time in goal. */
export function chooseGoalkeeper(
  candidates: readonly PlayerId[],
  context: GoalkeeperContext,
  options: Readonly<{ allowUnavailable?: boolean }> = {},
): PlayerId | undefined {
  const exposure = context.exposure ?? {};
  const ranked = candidates
    .map((id, index) => ({
      id,
      index,
      rank: preferenceRank(context.goalkeeperPreferenceByPlayer?.[id]),
      goalkeeperMs: exposureOf(exposure, id, "GK"),
    }))
    .filter((candidate) => options.allowUnavailable || candidate.rank < 2)
    .sort(
      (left, right) =>
        left.rank - right.rank ||
        left.goalkeeperMs - right.goalkeeperMs ||
        left.index - right.index,
    );
  return ranked[0]?.id;
}

/**
 * Keeps exactly one slot per lineup player. Existing valid assignments are
 * preserved; remaining lineup players fill empty slots in formation order.
 */
export function normalizeRoleAssignments(
  formation: Formation,
  lineupIds: readonly PlayerId[],
  assignments: readonly RoleAssignment[] = [],
): RoleAssignment[] {
  const lineup = new Set(lineupIds);
  const bySlot = new Map<string, PlayerId>();
  const assigned = new Set<PlayerId>();
  for (const assignment of assignments) {
    if (
      !roleSlotById(formation, assignment.roleSlotId) ||
      !lineup.has(assignment.playerId) ||
      bySlot.has(assignment.roleSlotId) ||
      assigned.has(assignment.playerId)
    )
      continue;
    bySlot.set(assignment.roleSlotId, assignment.playerId);
    assigned.add(assignment.playerId);
  }
  const unassigned = lineupIds.filter((id) => !assigned.has(id));
  for (const roleSlot of formation.slots) {
    if (bySlot.has(roleSlot.id)) continue;
    const next = unassigned.shift();
    if (next === undefined) break;
    bySlot.set(roleSlot.id, next);
  }
  return formation.slots.flatMap((roleSlot) => {
    const id = bySlot.get(roleSlot.id);
    return id === undefined ? [] : [{ roleSlotId: roleSlot.id, playerId: id }];
  });
}

/**
 * Suggests a starting shape: the keeper by willingness and least goal time,
 * then outfield slots so each child leans towards families they have played least.
 */
export function suggestRoleAssignments(
  formation: Formation,
  lineupIds: readonly PlayerId[],
  context: GoalkeeperContext & Readonly<{ preferredGoalkeeperId?: PlayerId }> = {},
): RoleAssignment[] {
  const exposure = context.exposure ?? {};
  const result: RoleAssignment[] = [];
  const remaining = [...lineupIds];
  const keeperSlot = goalkeeperSlot(formation);
  if (keeperSlot) {
    const keeper =
      context.preferredGoalkeeperId && remaining.includes(context.preferredGoalkeeperId)
        ? context.preferredGoalkeeperId
        : (chooseGoalkeeper(remaining, context) ??
          chooseGoalkeeper(remaining, context, { allowUnavailable: true }));
    if (keeper !== undefined) {
      result.push({ roleSlotId: keeperSlot.id, playerId: keeper });
      remaining.splice(remaining.indexOf(keeper), 1);
    }
  }
  const outfieldSlots = formation.slots.filter(
    (candidate) => candidate.family !== "GK",
  );
  const openSlots = [...outfieldSlots];
  const pairs = remaining
    .flatMap((id, playerIndex) =>
      outfieldSlots.map((roleSlot, slotIndex) => {
        const total = OUTFIELD_FAMILIES.reduce(
          (sum, family) => sum + exposureOf(exposure, id, family),
          0,
        );
        const share = total > 0 ? exposureOf(exposure, id, roleSlot.family) / total : 0;
        return { id, roleSlot, share, playerIndex, slotIndex };
      }),
    )
    .sort(
      (left, right) =>
        left.share - right.share ||
        left.playerIndex - right.playerIndex ||
        left.slotIndex - right.slotIndex,
    );
  const placed = new Set<PlayerId>();
  for (const pair of pairs) {
    if (placed.has(pair.id) || !openSlots.includes(pair.roleSlot)) continue;
    result.push({ roleSlotId: pair.roleSlot.id, playerId: pair.id });
    placed.add(pair.id);
    openSlots.splice(openSlots.indexOf(pair.roleSlot), 1);
  }
  return normalizeRoleAssignments(formation, lineupIds, result);
}

export type PositionMove = Readonly<{
  playerId: PlayerId;
  fromRoleSlotId: string;
  toRoleSlotId: string;
}>;

export type RoleChange = Readonly<{
  assignments: RoleAssignment[];
  /** Internal moves by players who stay on the field. At most one. */
  moves: readonly PositionMove[];
  /** The keeper slot ended up with a child who is unavailable for goal. */
  goalkeeperWarning: boolean;
}>;

/**
 * An incoming child inherits the outgoing child's slot. The only automatic
 * internal move protects the goal: an unwilling incoming child never takes
 * the keeper slot while a willing child is on the field.
 */
export function rolesAfterSubstitution(
  formation: Formation,
  assignmentsBefore: readonly RoleAssignment[],
  swaps: readonly Readonly<{
    outgoingPlayerId: PlayerId;
    incomingPlayerId: PlayerId;
  }>[],
  context: GoalkeeperContext = {},
): RoleChange {
  const bySlot = new Map(
    assignmentsBefore.map((assignment) => [assignment.roleSlotId, assignment.playerId]),
  );
  const slotByPlayer = new Map(
    assignmentsBefore.map((assignment) => [assignment.playerId, assignment.roleSlotId]),
  );
  for (const swap of swaps) {
    const roleSlotId = slotByPlayer.get(swap.outgoingPlayerId);
    if (roleSlotId === undefined) continue;
    bySlot.set(roleSlotId, swap.incomingPlayerId);
    slotByPlayer.delete(swap.outgoingPlayerId);
    slotByPlayer.set(swap.incomingPlayerId, roleSlotId);
  }
  const moves: PositionMove[] = [];
  let goalkeeperWarning = false;
  const keeperSlot = goalkeeperSlot(formation);
  const newKeeper = keeperSlot ? bySlot.get(keeperSlot.id) : undefined;
  const incoming = new Set(swaps.map((swap) => swap.incomingPlayerId));
  if (keeperSlot && newKeeper !== undefined && incoming.has(newKeeper)) {
    const preferences = context.goalkeeperPreferenceByPlayer ?? {};
    const newKeeperRank = preferenceRank(preferences[newKeeper]);
    if (newKeeperRank > 0) {
      const staying = [...bySlot.entries()]
        .filter(([roleSlotId, id]) => roleSlotId !== keeperSlot.id && !incoming.has(id))
        .map(([, id]) => id);
      const replacement = chooseGoalkeeper(staying, context);
      if (
        replacement !== undefined &&
        preferenceRank(preferences[replacement]) < newKeeperRank
      ) {
        const replacementSlot = slotByPlayer.get(replacement)!;
        bySlot.set(keeperSlot.id, replacement);
        bySlot.set(replacementSlot, newKeeper);
        moves.push({
          playerId: replacement,
          fromRoleSlotId: replacementSlot,
          toRoleSlotId: keeperSlot.id,
        });
      } else if (newKeeperRank === 2) goalkeeperWarning = true;
    }
  }
  const lineup = [...bySlot.values()];
  return {
    assignments: normalizeRoleAssignments(
      formation,
      lineup,
      [...bySlot.entries()].map(([roleSlotId, id]) => ({ roleSlotId, playerId: id })),
    ),
    moves,
    goalkeeperWarning,
  };
}

/** Swaps the slots of two field players, or moves one into an empty slot. */
export function swapRoles(
  formation: Formation,
  assignments: readonly RoleAssignment[],
  first: PlayerId,
  second: PlayerId,
): RoleAssignment[] {
  const firstSlot = assignments.find((assignment) => assignment.playerId === first);
  const secondSlot = assignments.find((assignment) => assignment.playerId === second);
  if (!firstSlot || !secondSlot) return [...assignments];
  const lineup = assignments.map((assignment) => assignment.playerId);
  return normalizeRoleAssignments(
    formation,
    lineup,
    assignments.map((assignment) =>
      assignment.playerId === first
        ? { roleSlotId: secondSlot.roleSlotId, playerId: first }
        : assignment.playerId === second
          ? { roleSlotId: firstSlot.roleSlotId, playerId: second }
          : assignment,
    ),
  );
}

export type RoleProjection = Readonly<{
  assignments: readonly RoleAssignment[];
  exposureMsByPlayer: PositionExposure;
}>;

const lineupAfterSubstitution = (
  lineup: readonly PlayerId[],
  outgoing: readonly PlayerId[],
  incoming: readonly PlayerId[],
) => [...lineup.filter((id) => !outgoing.includes(id)), ...incoming];

/**
 * Replays who stood in which slot and accumulates active time per position
 * family. Events without explicit role facts fall back to slot inheritance.
 */
export function projectRoles(
  formation: Formation,
  events: readonly MatchEvent[],
  endElapsedMs?: number,
): RoleProjection {
  const exposure: Record<PlayerId, Partial<Record<PositionFamily, number>>> = {};
  let assignments: RoleAssignment[] = [];
  let lineup: PlayerId[] = [];
  let started = false;
  let ended = false;
  let cursor = 0;
  let duration = Number.POSITIVE_INFINITY;
  const accrue = (until: number) => {
    const end = Math.min(until, duration);
    if (!started || ended || end <= cursor) return;
    for (const assignment of assignments) {
      const family = roleSlotById(formation, assignment.roleSlotId)?.family;
      if (!family) continue;
      const current = (exposure[assignment.playerId] ??= {});
      current[family] = (current[family] ?? 0) + (end - cursor);
    }
    cursor = end;
  };
  for (const event of effectiveEvents(events).events) {
    if (ended) break;
    accrue(event.elapsedMs);
    switch (event.type) {
      case "MATCH_STARTED":
        if (started) break;
        started = true;
        cursor = event.elapsedMs;
        if (event.payload.plannedDurationMs !== undefined)
          duration = event.payload.plannedDurationMs;
        lineup = [...event.payload.starterLineupIds];
        assignments = normalizeRoleAssignments(
          formation,
          lineup,
          event.payload.starterRoleAssignments,
        );
        break;
      case "SUBSTITUTION_CONFIRMED": {
        const { outgoingPlayerIds, incomingPlayerIds } = event.payload;
        if (
          outgoingPlayerIds.some((id) => !lineup.includes(id)) ||
          incomingPlayerIds.some((id) => lineup.includes(id))
        )
          break;
        lineup = lineupAfterSubstitution(lineup, outgoingPlayerIds, incomingPlayerIds);
        assignments = event.payload.roleAssignmentsAfter
          ? normalizeRoleAssignments(
              formation,
              lineup,
              event.payload.roleAssignmentsAfter,
            )
          : rolesAfterSubstitution(
              formation,
              assignments,
              outgoingPlayerIds.map((outgoingPlayerId, index) => ({
                outgoingPlayerId,
                incomingPlayerId: incomingPlayerIds[index]!,
              })),
            ).assignments;
        break;
      }
      case "LINEUP_SYNCHRONIZED":
        lineup = [...event.payload.lineupAfterIds];
        assignments = normalizeRoleAssignments(
          formation,
          lineup,
          event.payload.roleAssignmentsAfter ?? assignments,
        );
        break;
      case "MATCH_DURATION_CHANGED":
        duration = event.payload.newDurationMs;
        break;
      case "MATCH_ENDED":
      case "MATCH_ABANDONED":
        ended = true;
        break;
      default:
        break;
    }
  }
  if (endElapsedMs !== undefined) accrue(endElapsedMs);
  return { assignments, exposureMsByPlayer: exposure };
}

export function addExposure(
  ...sources: readonly PositionExposure[]
): Record<PlayerId, Partial<Record<PositionFamily, number>>> {
  const total: Record<PlayerId, Partial<Record<PositionFamily, number>>> = {};
  for (const source of sources) {
    for (const [id, families] of Object.entries(source) as [
      PlayerId,
      Partial<Record<PositionFamily, number>>,
    ][]) {
      const current = (total[id] ??= {});
      for (const [family, ms] of Object.entries(families) as [PositionFamily, number][])
        current[family] = (current[family] ?? 0) + ms;
    }
  }
  return total;
}
