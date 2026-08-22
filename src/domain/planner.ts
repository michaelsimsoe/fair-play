import { allocateRemaining } from "./allocator";
import type { PlayerId } from "./ids";
import type { Recommendation, RecommendationReason } from "./types";

export type PlannerInput = Readonly<{
  nowElapsedMs: number;
  plannedEndElapsedMs: number;
  fieldSlots: number;
  orderedAvailablePlayerIds: readonly PlayerId[];
  currentLineupIds: readonly PlayerId[];
  balancesMsByPlayer: Readonly<Record<PlayerId, number>>;
  currentFieldStintMsByPlayer: Readonly<Record<PlayerId, number>>;
  currentBenchStintMsByPlayer: Readonly<Record<PlayerId, number>>;
  minimumPreferredStintMs: number;
  preferredChangeIntervalMs?: number;
  previousRecommendation?: Recommendation;
  actualMsByPlayer?: Readonly<Record<PlayerId, number>>;
  idealMsByPlayer?: Readonly<Record<PlayerId, number>>;
  availabilityChanged?: boolean;
  manualDeviation?: boolean;
}>;

export type PlannerPreviewStep = Readonly<{
  dueAtElapsedMs: number;
  lineupBeforeIds: readonly PlayerId[];
  lineupAfterIds: readonly PlayerId[];
  swaps: readonly Readonly<{
    outgoingPlayerId: PlayerId;
    incomingPlayerId: PlayerId;
  }>[];
}>;

export type PlannerResult = Readonly<{
  recommendation?: Recommendation;
  preview: readonly PlannerPreviewStep[];
}>;

const range = (values: readonly number[]) =>
  values.length === 0 ? 0 : Math.max(...values) - Math.min(...values);
const orderIndex = (ids: readonly PlayerId[], id: PlayerId) => ids.indexOf(id);

const stint = (values: Readonly<Record<PlayerId, number>>, id: PlayerId) =>
  values[id] ?? 0;
const amount = (values: Readonly<Record<PlayerId, number>>, id: PlayerId) =>
  values[id] ?? 0;

function rankIncoming(
  bench: readonly PlayerId[],
  allocation: Readonly<Record<PlayerId, number>>,
  balances: Readonly<Record<PlayerId, number>>,
  remaining: number,
  benchStints: Readonly<Record<PlayerId, number>>,
  order: readonly PlayerId[],
): PlayerId[] {
  return [...bench].sort(
    (a, b) =>
      amount(allocation, b) / remaining - amount(allocation, a) / remaining ||
      amount(balances, a) - amount(balances, b) ||
      stint(benchStints, b) - stint(benchStints, a) ||
      orderIndex(order, a) - orderIndex(order, b),
  );
}

function rankOutgoing(
  field: readonly PlayerId[],
  allocationAfterDelay: Readonly<Record<PlayerId, number>>,
  balancesAfterDelay: Readonly<Record<PlayerId, number>>,
  remaining: number,
  fieldStints: Readonly<Record<PlayerId, number>>,
  order: readonly PlayerId[],
): PlayerId[] {
  return [...field].sort(
    (a, b) =>
      amount(allocationAfterDelay, a) / remaining -
        amount(allocationAfterDelay, b) / remaining ||
      amount(balancesAfterDelay, b) - amount(balancesAfterDelay, a) ||
      stint(fieldStints, b) - stint(fieldStints, a) ||
      orderIndex(order, a) - orderIndex(order, b),
  );
}

type Simulation = {
  now: number;
  end: number;
  lineup: PlayerId[];
  balances: Record<PlayerId, number>;
  fieldStints: Record<PlayerId, number>;
  benchStints: Record<PlayerId, number>;
  steps: PlannerPreviewStep[];
};

const copyTotals = (
  ids: readonly PlayerId[],
  values: Readonly<Record<PlayerId, number>>,
) =>
  Object.fromEntries(ids.map((id) => [id, values[id] ?? 0])) as Record<
    PlayerId,
    number
  >;

function nextStep(
  input: PlannerInput,
  simulation: Simulation,
): PlannerPreviewStep | undefined {
  const ids = input.orderedAvailablePlayerIds;
  const remaining = simulation.end - simulation.now;
  if (remaining <= 0 || input.fieldSlots <= 0 || ids.length <= input.fieldSlots)
    return undefined;
  const lineup = simulation.lineup.filter((id) => ids.includes(id));
  const bench = ids.filter((id) => !lineup.includes(id));
  if (lineup.length !== input.fieldSlots || bench.length === 0) return undefined;
  const allocation = allocateRemaining(
    simulation.balances,
    remaining,
    input.fieldSlots,
    ids,
  );
  const preferred = Math.max(
    0,
    Math.min(
      remaining,
      input.preferredChangeIntervalMs ??
        Math.floor((input.plannedEndElapsedMs - input.nowElapsedMs) / ids.length),
    ),
  );
  const latestBenchEntry = Math.min(
    ...bench.map((id) => remaining - amount(allocation, id)),
  );
  const maxFieldStay = Math.min(...lineup.map((id) => amount(allocation, id)));
  let delay = Math.min(preferred, latestBenchEntry, maxFieldStay, remaining);
  if (!Number.isFinite(delay)) return undefined;
  delay = Math.max(0, Math.floor(delay));

  // A final sub-minimum stint is unhelpful unless a player has no slack left.
  const forced = latestBenchEntry <= 0 || maxFieldStay <= 0;
  if (
    !forced &&
    delay > 0 &&
    delay < input.minimumPreferredStintMs &&
    remaining - delay < input.minimumPreferredStintMs
  ) {
    return undefined;
  }
  const afterRemaining = remaining - delay;
  if (afterRemaining <= 0) return undefined;

  const balancesAfter = copyTotals(ids, simulation.balances);
  const allocationAfter = copyTotals(ids, allocation);
  const idealIncrement = (delay * input.fieldSlots) / ids.length;
  for (const id of ids) {
    if (lineup.includes(id)) {
      balancesAfter[id] = amount(balancesAfter, id) + delay - idealIncrement;
      allocationAfter[id] = Math.max(0, amount(allocationAfter, id) - delay);
    } else {
      balancesAfter[id] = amount(balancesAfter, id) - idealIncrement;
    }
  }
  const rankedIncoming = rankIncoming(
    bench,
    allocationAfter,
    balancesAfter,
    afterRemaining,
    simulation.benchStints,
    ids,
  );
  const rankedOutgoing = rankOutgoing(
    lineup,
    allocationAfter,
    balancesAfter,
    afterRemaining,
    simulation.fieldStints,
    ids,
  );
  const forcedIncoming = rankedIncoming.filter(
    (id) => remaining - amount(allocation, id) <= delay,
  );
  const forcedOutgoing = rankedOutgoing.filter((id) => amount(allocation, id) <= delay);
  /*
   * Usually a single pair is sufficient. At a zero-slack boundary, however,
   * every forced player must change now or their remaining allocation is no
   * longer feasible. Fill the opposite side deterministically if only one
   * side supplied all forced members.
   */
  const swapCount = Math.max(forcedIncoming.length, forcedOutgoing.length, 1);
  const incoming = [
    ...forcedIncoming,
    ...rankedIncoming.filter((id) => !forcedIncoming.includes(id)),
  ].slice(0, swapCount);
  const outgoing = [
    ...forcedOutgoing,
    ...rankedOutgoing.filter((id) => !forcedOutgoing.includes(id)),
  ].slice(0, swapCount);
  if (incoming.length !== swapCount || outgoing.length !== swapCount) return undefined;
  const swaps = outgoing.map((outgoingPlayerId, index) => ({
    outgoingPlayerId,
    incomingPlayerId: incoming[index]!,
  }));
  const outgoingIds = new Set(outgoing);
  return {
    dueAtElapsedMs: simulation.now + delay,
    lineupBeforeIds: lineup,
    lineupAfterIds: [...lineup.filter((id) => !outgoingIds.has(id)), ...incoming],
    swaps,
  };
}

function advanceSimulation(
  input: PlannerInput,
  simulation: Simulation,
  step: PlannerPreviewStep,
): void {
  const ids = input.orderedAvailablePlayerIds;
  const delay = step.dueAtElapsedMs - simulation.now;
  const idealIncrement = (delay * input.fieldSlots) / ids.length;
  for (const id of ids) {
    if (simulation.lineup.includes(id)) {
      simulation.balances[id] =
        amount(simulation.balances, id) + delay - idealIncrement;
      simulation.fieldStints[id] = amount(simulation.fieldStints, id) + delay;
      simulation.benchStints[id] = 0;
    } else {
      simulation.balances[id] = amount(simulation.balances, id) - idealIncrement;
      simulation.benchStints[id] = amount(simulation.benchStints, id) + delay;
      simulation.fieldStints[id] = 0;
    }
  }
  simulation.now = step.dueAtElapsedMs;
  simulation.lineup = [...step.lineupAfterIds];
  simulation.steps.push(step);
}

export function planMatch(input: PlannerInput): PlannerResult {
  const ids = [...input.orderedAvailablePlayerIds];
  const remaining = input.plannedEndElapsedMs - input.nowElapsedMs;
  if (
    !Number.isInteger(input.nowElapsedMs) ||
    !Number.isInteger(input.plannedEndElapsedMs) ||
    remaining <= 0 ||
    input.fieldSlots <= 0 ||
    input.fieldSlots > ids.length ||
    new Set(ids).size !== ids.length
  )
    return { preview: [] };

  const simulation: Simulation = {
    now: input.nowElapsedMs,
    end: input.plannedEndElapsedMs,
    lineup: [...input.currentLineupIds],
    balances: copyTotals(ids, input.balancesMsByPlayer),
    fieldStints: copyTotals(ids, input.currentFieldStintMsByPlayer),
    benchStints: copyTotals(ids, input.currentBenchStintMsByPlayer),
    steps: [],
  };
  // A normal youth roster has few players; this hard limit is a safety rail for malformed input.
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const step = nextStep(input, simulation);
    if (!step) break;
    const previousNow = simulation.now;
    advanceSimulation(input, simulation, step);
    // A live action may be immediately due. Do not manufacture a zero-time
    // chain of swaps in its preview; the confirmed action will replan.
    if (simulation.now === previousNow) break;
  }
  const first = simulation.steps[0];
  if (!first) return { preview: [] };

  const allocation = allocateRemaining(
    input.balancesMsByPlayer,
    remaining,
    input.fieldSlots,
    ids,
  );
  const futureIdeal = (remaining * input.fieldSlots) / ids.length;
  const projectedActual = Object.fromEntries(
    ids.map((id) => [id, (input.actualMsByPlayer?.[id] ?? 0) + amount(allocation, id)]),
  ) as Record<PlayerId, number>;
  const projectedIdeal = Object.fromEntries(
    ids.map((id) => [id, (input.idealMsByPlayer?.[id] ?? 0) + futureIdeal]),
  ) as Record<PlayerId, number>;
  const projectedBalance = Object.fromEntries(
    ids.map((id) => [
      id,
      amount(input.balancesMsByPlayer, id) + amount(allocation, id) - futureIdeal,
    ]),
  ) as Record<PlayerId, number>;
  const perfectTargetFeasible = range(Object.values(projectedBalance)) < 1e-7;
  const hasUnequalBalances = ids.some(
    (id) => Math.abs(amount(input.balancesMsByPlayer, id)) > 1e-7,
  );
  const reasons: RecommendationReason[] = [];
  if (!hasUnequalBalances && !input.availabilityChanged && !input.manualDeviation)
    reasons.push("normal-rotation");
  const firstSwap = first.swaps[0]!;
  if (amount(projectedBalance, firstSwap.incomingPlayerId) < 0)
    reasons.push("player-behind-target");
  if (amount(projectedBalance, firstSwap.outgoingPlayerId) > 0)
    reasons.push("player-ahead-of-target");
  if (input.availabilityChanged) reasons.push("availability-change");
  if (input.manualDeviation) reasons.push("manual-deviation");
  if (remaining < input.minimumPreferredStintMs) reasons.push("short-time-remaining");

  const shortStintWarnings = first.swaps
    .filter(
      (swap) =>
        (input.currentBenchStintMsByPlayer[swap.incomingPlayerId] ?? 0) <
        input.minimumPreferredStintMs,
    )
    .map((swap) => swap.incomingPlayerId);
  const recommendation: Recommendation = {
    id: `recommendation:${input.nowElapsedMs}:${first.dueAtElapsedMs}:${first.swaps.map((swap) => `${swap.outgoingPlayerId}-${swap.incomingPlayerId}`).join(",")}`,
    calculatedAtElapsedMs: input.nowElapsedMs,
    dueAtElapsedMs: first.dueAtElapsedMs,
    swaps: first.swaps,
    projectedActualMsByPlayer: projectedActual,
    projectedIdealMsByPlayer: projectedIdeal,
    projectedBalanceMsByPlayer: projectedBalance,
    projectedBalanceRangeMs: range(Object.values(projectedBalance)),
    reasons,
    diagnostics: {
      perfectTargetFeasible,
      expectedSubstitutionCount: simulation.steps.length,
      shortStintWarnings,
    },
  };
  return { recommendation, preview: simulation.steps };
}

export const planRecommendation = (input: PlannerInput): Recommendation | undefined =>
  planMatch(input).recommendation;
