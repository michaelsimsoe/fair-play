import {
  allocateBoundedCapacity,
  allocateCappedCapacity,
  allocateRemaining,
  type CappedAllocation,
} from "./allocator";
import type { PlayerId } from "./ids";
import type {
  FixedRhythmDiagnostics,
  FutureAllocationCapDiagnostics,
  Recommendation,
  RecommendationReason,
} from "./types";

export const DEFAULT_COMPENSATION_TOLERANCE_MS = 30_000;
export const DEFAULT_MINIMUM_BENCH_REST_MS = 60_000;
export const DEFAULT_RETURN_COMPENSATION_CAP_MS = 60_000;

export type PlannerInput = Readonly<{
  nowElapsedMs: number;
  plannedEndElapsedMs: number;
  fieldSlots: number;
  orderedAvailablePlayerIds: readonly PlayerId[];
  currentLineupIds: readonly PlayerId[];
  balancesMsByPlayer: Readonly<Record<PlayerId, number>>;
  /**
   * Per-player ceiling for future actual field time in this plan. A returning
   * team player's caller can use `max(0, matchTargetMs + 60_000 - actualMs)`.
   * When all ceilings cannot fill the field, the plan records only the
   * unavoidable deterministic relaxations.
   */
  maximumFutureActualMsByPlayer?: Readonly<Partial<Record<PlayerId, number>>>;
  /**
   * Players whose fairness is confined to this match. Their values in
   * `balancesMsByPlayer` are ignored so they cannot consume or provide
   * tournament compensation.
   */
  matchOnlyPlayerIds?: readonly PlayerId[];
  /**
   * Actual-minus-ideal time accrued in this match so far. This lets guests be
   * planned against their match target even when team balances span matches.
   */
  currentMatchBalancesMsByPlayer?: Readonly<Record<PlayerId, number>>;
  currentFieldStintMsByPlayer: Readonly<Record<PlayerId, number>>;
  currentBenchStintMsByPlayer: Readonly<Record<PlayerId, number>>;
  minimumPreferredStintMs: number;
  /**
   * An ordinary incoming player should have this much continuous bench rest,
   * unless their entry is required to keep the allocation feasible.
   */
  minimumPreferredBenchRestMs?: number;
  compensationToleranceMs?: number;
  preferredChangeIntervalMs?: number;
  /**
   * Optional fixed recommendation grid on the match clock. For example,
   * 120_000 recommends 02:00, 04:00, and so on; replanning never shifts it.
   * When provided, this takes precedence over `preferredChangeIntervalMs`.
   */
  fixedSubstitutionRhythmMs?: number;
  /**
   * A fixed-rhythm boundary already used by a change made shortly before it,
   * such as an early confirmation or a manual change with the planned incoming
   * child. The next recommendation moves to the following boundary.
   */
  consumedRhythmBoundaryElapsedMs?: number;
  /**
   * The last full fixed-rhythm preview. Supplying it lets a delayed suggested
   * confirmation retain its already communicated future rotation where the
   * actual lineup still permits it.
   */
  previousPreview?: readonly PlannerPreviewStep[];
  previousRecommendation?: Recommendation;
  actualMsByPlayer?: Readonly<Record<PlayerId, number>>;
  idealMsByPlayer?: Readonly<Record<PlayerId, number>>;
  availabilityChanged?: boolean;
  manualDeviation?: boolean;
  /** Players who stay on the field outside the automatic rotation. */
  lockedOnFieldPlayerIds?: readonly PlayerId[];
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
  diagnostics: Readonly<{
    futureAllocationCaps: FutureAllocationCapDiagnostics;
    fixedRhythm?: FixedRhythmDiagnostics;
  }>;
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
  currentMatchActual: Readonly<Record<PlayerId, number>>,
  entryDelayMs: number,
  minimumPreferredBenchRestMs: number,
  order: readonly PlayerId[],
): PlayerId[] {
  const hasPreferredRest = (id: PlayerId) =>
    minimumPreferredBenchRestMs > 0 &&
    (amount(currentMatchActual, id) === 0 ||
      stint(benchStints, id) + entryDelayMs >= minimumPreferredBenchRestMs);
  return [...bench].sort(
    (a, b) =>
      amount(allocation, b) / remaining - amount(allocation, a) / remaining ||
      amount(balances, a) - amount(balances, b) ||
      Number(hasPreferredRest(b)) - Number(hasPreferredRest(a)) ||
      stint(benchStints, b) - stint(benchStints, a) ||
      (minimumPreferredBenchRestMs > 0
        ? amount(currentMatchActual, a) - amount(currentMatchActual, b)
        : 0) ||
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
  currentMatchBalances: Record<PlayerId, number>;
  currentMatchActual: Record<PlayerId, number>;
  futureAllocatedMs: Record<PlayerId, number>;
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

const tolerance = (input: PlannerInput) =>
  Number.isFinite(input.compensationToleranceMs) && input.compensationToleranceMs! > 0
    ? input.compensationToleranceMs!
    : 0;

const minimumBenchRest = (input: PlannerInput) =>
  Number.isFinite(input.minimumPreferredBenchRestMs) &&
  input.minimumPreferredBenchRestMs! > 0
    ? Math.floor(input.minimumPreferredBenchRestMs!)
    : 0;

const fixedSubstitutionRhythm = (input: PlannerInput) =>
  Number.isFinite(input.fixedSubstitutionRhythmMs) &&
  input.fixedSubstitutionRhythmMs! >= 1
    ? Math.floor(input.fixedSubstitutionRhythmMs!)
    : undefined;

function preferredDelay(
  input: PlannerInput,
  simulation: Simulation,
  remaining: number,
): number {
  const rhythm = fixedSubstitutionRhythm(input);
  if (rhythm !== undefined) {
    const nextBoundary = (Math.floor(simulation.now / rhythm) + 1) * rhythm;
    return Math.max(0, Math.min(remaining, nextBoundary - simulation.now));
  }
  return Math.max(
    0,
    Math.min(
      remaining,
      input.preferredChangeIntervalMs ??
        Math.floor(
          (input.plannedEndElapsedMs - input.nowElapsedMs) /
            input.orderedAvailablePlayerIds.length,
        ),
    ),
  );
}

function retainedFixedStep(
  input: PlannerInput,
  dueAtElapsedMs: number,
  lineup: readonly PlayerId[],
  ids: readonly PlayerId[],
): PlannerPreviewStep | undefined {
  if (!input.previousPreview) return undefined;
  const intended = input.previousPreview.find(
    (step) => step.dueAtElapsedMs === dueAtElapsedMs,
  );
  if (!intended || intended.swaps.length === 0) return undefined;
  const outgoing = intended.swaps.map((swap) => swap.outgoingPlayerId);
  const incoming = intended.swaps.map((swap) => swap.incomingPlayerId);
  if (
    outgoing.some((id) => !lineup.includes(id)) ||
    incoming.some((id) => lineup.includes(id) || !ids.includes(id)) ||
    new Set(outgoing).size !== outgoing.length ||
    new Set(incoming).size !== incoming.length ||
    outgoing.length !== incoming.length
  )
    return undefined;
  const outgoingSet = new Set(outgoing);
  return {
    dueAtElapsedMs,
    lineupBeforeIds: lineup,
    lineupAfterIds: [...lineup.filter((id) => !outgoingSet.has(id)), ...incoming],
    swaps: intended.swaps,
  };
}

function matchTotals(
  input: PlannerInput,
  ids: readonly PlayerId[],
): Readonly<{
  actual: Record<PlayerId, number>;
  ideal: Record<PlayerId, number>;
  balances: Record<PlayerId, number>;
}> {
  const actual = copyTotals(ids, input.actualMsByPlayer ?? {});
  const ideal = copyTotals(ids, input.idealMsByPlayer ?? {});
  const balances = Object.fromEntries(
    ids.map((id) => [
      id,
      input.currentMatchBalancesMsByPlayer?.[id] ?? actual[id]! - ideal[id]!,
    ]),
  ) as Record<PlayerId, number>;
  for (const id of ids) {
    if (input.currentMatchBalancesMsByPlayer?.[id] !== undefined) {
      ideal[id] = actual[id]! - balances[id]!;
    }
  }
  return { actual, ideal, balances };
}

function matchOnlyIds(
  input: PlannerInput,
  ids: readonly PlayerId[],
): ReadonlySet<PlayerId> {
  return new Set(input.matchOnlyPlayerIds?.filter((id) => ids.includes(id)) ?? []);
}

function futureMaximums(
  input: PlannerInput,
  ids: readonly PlayerId[],
  remainingMs: number,
  alreadyAllocatedMs: Readonly<Record<PlayerId, number>> = {},
): Record<PlayerId, number> {
  return Object.fromEntries(
    ids.map((id) => {
      const requested = input.maximumFutureActualMsByPlayer?.[id];
      if (requested !== undefined && (!Number.isInteger(requested) || requested < 0))
        throw new RangeError(
          `Future allocation cap for ${String(id)} must be a non-negative integer.`,
        );
      return [
        id,
        requested === undefined
          ? remainingMs
          : Math.min(
              Math.max(0, requested - amount(alreadyAllocatedMs, id)),
              remainingMs,
            ),
      ];
    }),
  );
}

function capDiagnostics(
  allocation: CappedAllocation,
  requestedMaximums: Readonly<Record<PlayerId, number>>,
  requiredCapacityMs: number,
): FutureAllocationCapDiagnostics {
  return {
    capsFeasible: allocation.capsFeasible,
    requestedCapacityMs: Object.values(requestedMaximums).reduce(
      (total, value) => total + value,
      0,
    ),
    requiredCapacityMs,
    allocatedFutureActualMsByPlayer: allocation.allocationMsByPlayer,
    relaxations: allocation.capRelaxations.map((relaxation) => ({
      playerId: relaxation.playerId,
      maximumFutureActualMs: relaxation.maximumMs,
      allocatedFutureActualMs: relaxation.allocatedMs,
      relaxedByMs: relaxation.exceededMs,
    })),
  };
}

function allocateGuestTargets(
  guestIds: readonly PlayerId[],
  currentMatchBalances: Readonly<Record<PlayerId, number>>,
  remainingMs: number,
  futureIdealMs: number,
  minimumCapacity: number,
  maximumCapacity: number,
  maximums?: Readonly<Record<PlayerId, number>>,
): Record<PlayerId, number> {
  const desired = guestIds.map((id) =>
    Math.max(
      0,
      Math.min(remainingMs, futureIdealMs - amount(currentMatchBalances, id)),
    ),
  );
  const desiredCapacity = desired.reduce((sum, value) => sum + Math.round(value), 0);
  if (!maximums) {
    const allocation = Object.fromEntries(
      guestIds.map((id, index) => [id, Math.round(desired[index]!)]),
    ) as Record<PlayerId, number>;
    if (desiredCapacity >= minimumCapacity && desiredCapacity <= maximumCapacity)
      return allocation;
    return allocateBoundedCapacity(
      Object.fromEntries(guestIds.map((id, index) => [id, -desired[index]!])),
      Math.max(minimumCapacity, Math.min(maximumCapacity, desiredCapacity)),
      remainingMs,
      guestIds,
    );
  }
  const constrainedCapacity = Math.max(
    minimumCapacity,
    Math.min(maximumCapacity, desiredCapacity),
  );
  return allocateCappedCapacity(
    Object.fromEntries(guestIds.map((id, index) => [id, -desired[index]!])),
    constrainedCapacity,
    maximums,
    remainingMs,
    guestIds,
  ).allocationMsByPlayer;
}

function allocateFuture(
  input: PlannerInput,
  balances: Readonly<Record<PlayerId, number>>,
  currentMatchBalances: Readonly<Record<PlayerId, number>>,
  remainingMs: number,
  ids: readonly PlayerId[],
  matchOnly: ReadonlySet<PlayerId>,
  alreadyAllocatedMs: Readonly<Record<PlayerId, number>> = {},
): CappedAllocation {
  const capacity = remainingMs * input.fieldSlots;
  const hasExplicitCaps = input.maximumFutureActualMsByPlayer !== undefined;
  if (!hasExplicitCaps) {
    if (matchOnly.size === 0) {
      return {
        allocationMsByPlayer: allocateRemaining(
          balances,
          remainingMs,
          input.fieldSlots,
          ids,
        ),
        capsFeasible: true,
        capRelaxations: [],
      };
    }
    const guestIds = ids.filter((id) => matchOnly.has(id));
    const teamIds = ids.filter((id) => !matchOnly.has(id));
    const guestAllocation = allocateGuestTargets(
      guestIds,
      currentMatchBalances,
      remainingMs,
      capacity / ids.length,
      Math.max(0, capacity - teamIds.length * remainingMs),
      Math.min(capacity, guestIds.length * remainingMs),
    );
    const teamCapacity =
      capacity - Object.values(guestAllocation).reduce((sum, value) => sum + value, 0);
    const teamAllocation = allocateBoundedCapacity(
      balances,
      teamCapacity,
      remainingMs,
      teamIds,
    );
    return {
      allocationMsByPlayer: Object.fromEntries(
        ids.map((id) => [id, guestAllocation[id] ?? teamAllocation[id] ?? 0]),
      ),
      capsFeasible: true,
      capRelaxations: [],
    };
  }
  const maximums = futureMaximums(input, ids, remainingMs, alreadyAllocatedMs);
  const capBalances = Object.fromEntries(
    ids.map((id) => [
      id,
      matchOnly.has(id) ? amount(currentMatchBalances, id) : amount(balances, id),
    ]),
  ) as Record<PlayerId, number>;
  const totalMaximum = Object.values(maximums).reduce(
    (sum, maximum) => sum + maximum,
    0,
  );
  if (totalMaximum < capacity)
    return allocateCappedCapacity(capBalances, capacity, maximums, remainingMs, ids);
  if (matchOnly.size === 0) {
    return allocateCappedCapacity(balances, capacity, maximums, remainingMs, ids);
  }
  const guestIds = ids.filter((id) => matchOnly.has(id));
  const teamIds = ids.filter((id) => !matchOnly.has(id));
  const futureIdeal = capacity / ids.length;
  const teamMaximum = teamIds.reduce((sum, id) => sum + maximums[id]!, 0);
  const guestMaximum = guestIds.reduce((sum, id) => sum + maximums[id]!, 0);
  const guestAllocation = allocateGuestTargets(
    guestIds,
    currentMatchBalances,
    remainingMs,
    futureIdeal,
    Math.max(0, capacity - teamMaximum),
    Math.min(capacity, guestMaximum),
    maximums,
  );
  const teamCapacity =
    capacity - Object.values(guestAllocation).reduce((sum, value) => sum + value, 0);
  const teamAllocation = allocateCappedCapacity(
    balances,
    teamCapacity,
    maximums,
    remainingMs,
    teamIds,
  ).allocationMsByPlayer;
  return {
    allocationMsByPlayer: Object.fromEntries(
      ids.map((id) => [id, guestAllocation[id] ?? teamAllocation[id] ?? 0]),
    ),
    capsFeasible: true,
    capRelaxations: [],
  };
}

function unchangedLineupWithinTolerance(
  input: PlannerInput,
  simulation: Simulation,
  remainingMs: number,
  ids: readonly PlayerId[],
): boolean {
  const futureIdeal = (remainingMs * input.fieldSlots) / ids.length;
  return ids.every(
    (id) =>
      Math.abs(
        amount(simulation.currentMatchBalances, id) +
          (simulation.lineup.includes(id) ? remainingMs : 0) -
          futureIdeal,
      ) <= tolerance(input),
  );
}

function nextStep(
  input: PlannerInput,
  simulation: Simulation,
): PlannerPreviewStep | undefined {
  const ids = input.orderedAvailablePlayerIds;
  const matchOnly = matchOnlyIds(input, ids);
  const remaining = simulation.end - simulation.now;
  if (remaining <= 0 || input.fieldSlots <= 0 || ids.length <= input.fieldSlots)
    return undefined;
  const lineup = simulation.lineup.filter((id) => ids.includes(id));
  const bench = ids.filter((id) => !lineup.includes(id));
  if (lineup.length !== input.fieldSlots || bench.length === 0) return undefined;
  const allocation = allocateFuture(
    input,
    simulation.balances,
    simulation.currentMatchBalances,
    remaining,
    ids,
    matchOnly,
    simulation.futureAllocatedMs,
  ).allocationMsByPlayer;
  const preferred = preferredDelay(input, simulation, remaining);
  const latestBenchEntry = Math.min(
    ...bench.map((id) => remaining - amount(allocation, id)),
  );
  const maxFieldStay = Math.min(...lineup.map((id) => amount(allocation, id)));
  const maximumFeasibleDelay = Math.min(latestBenchEntry, maxFieldStay, remaining);
  let delay = Math.min(preferred, maximumFeasibleDelay);
  if (!Number.isFinite(delay)) return undefined;
  delay = Math.max(0, Math.floor(delay));
  const requiredBenchRest = minimumBenchRest(input);
  if (requiredBenchRest > 0) {
    const earliestPreferredEntryDelay = Math.min(
      ...bench.map((id) =>
        amount(simulation.currentMatchActual, id) === 0
          ? 0
          : Math.max(0, requiredBenchRest - stint(simulation.benchStints, id)),
      ),
    );
    if (
      earliestPreferredEntryDelay > delay &&
      earliestPreferredEntryDelay <= maximumFeasibleDelay
    ) {
      delay = earliestPreferredEntryDelay;
    }
  }

  // A final sub-minimum stint is unhelpful unless a player has no slack left.
  const forced = latestBenchEntry <= 0 || maxFieldStay <= 0;
  if (
    delay < input.minimumPreferredStintMs &&
    unchangedLineupWithinTolerance(input, simulation, remaining, ids)
  ) {
    return undefined;
  }
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
    simulation.currentMatchActual,
    delay,
    requiredBenchRest,
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
      simulation.currentMatchBalances[id] =
        amount(simulation.currentMatchBalances, id) + delay - idealIncrement;
      simulation.currentMatchActual[id] =
        amount(simulation.currentMatchActual, id) + delay;
      simulation.futureAllocatedMs[id] =
        amount(simulation.futureAllocatedMs, id) + delay;
      simulation.fieldStints[id] = amount(simulation.fieldStints, id) + delay;
      simulation.benchStints[id] = 0;
    } else {
      simulation.balances[id] = amount(simulation.balances, id) - idealIncrement;
      simulation.currentMatchBalances[id] =
        amount(simulation.currentMatchBalances, id) - idealIncrement;
      simulation.benchStints[id] = amount(simulation.benchStints, id) + delay;
      simulation.fieldStints[id] = 0;
    }
  }
  simulation.now = step.dueAtElapsedMs;
  simulation.lineup = [...step.lineupAfterIds];
  simulation.steps.push(step);
}

function fixedRhythmPlan(
  input: PlannerInput,
  ids: readonly PlayerId[],
  currentMatch: Readonly<{
    actual: Record<PlayerId, number>;
    ideal: Record<PlayerId, number>;
    balances: Record<PlayerId, number>;
  }>,
  initialBalances: Readonly<Record<PlayerId, number>>,
): PlannerResult | undefined {
  const rhythm = fixedSubstitutionRhythm(input);
  const remaining = input.plannedEndElapsedMs - input.nowElapsedMs;
  const gridBoundary =
    rhythm === undefined
      ? undefined
      : (Math.floor(input.nowElapsedMs / rhythm) + 1) * rhythm;
  const nextBoundary =
    rhythm !== undefined &&
    gridBoundary !== undefined &&
    input.consumedRhythmBoundaryElapsedMs === gridBoundary
      ? gridBoundary + rhythm
      : gridBoundary;
  if (
    rhythm === undefined ||
    remaining <= 0 ||
    input.currentLineupIds.length !== input.fieldSlots ||
    new Set(input.currentLineupIds).size !== input.fieldSlots ||
    input.currentLineupIds.some((id) => !ids.includes(id))
  )
    return undefined;
  if (nextBoundary === undefined || nextBoundary >= input.plannedEndElapsedMs) {
    const maximums = futureMaximums(input, ids, remaining);
    const allocation = Object.fromEntries(
      ids.map((id) => [id, input.currentLineupIds.includes(id) ? remaining : 0]),
    );
    return {
      preview: [],
      diagnostics: {
        futureAllocationCaps: {
          capsFeasible: ids.every((id) => allocation[id]! <= maximums[id]!),
          requestedCapacityMs: Object.values(maximums).reduce(
            (total, maximum) => total + maximum,
            0,
          ),
          requiredCapacityMs: remaining * input.fieldSlots,
          allocatedFutureActualMsByPlayer: allocation,
          relaxations: ids
            .filter((id) => allocation[id]! > maximums[id]!)
            .map((id) => ({
              playerId: id,
              maximumFutureActualMs: maximums[id]!,
              allocatedFutureActualMs: allocation[id]!,
              relaxedByMs: allocation[id]! - maximums[id]!,
            })),
        },
        fixedRhythm: {
          plannedIntervalCountByPlayer: Object.fromEntries(
            ids.map((id) => [id, input.currentLineupIds.includes(id) ? 1 : 0]),
          ),
          intervalBalanceWithinOne: true,
        },
      },
    };
  }

  const intervalCount =
    1 + Math.ceil((input.plannedEndElapsedMs - nextBoundary) / rhythm);
  const intervalDuration = (interval: number) =>
    interval === 0
      ? nextBoundary - input.nowElapsedMs
      : Math.min(
          rhythm,
          input.plannedEndElapsedMs - (nextBoundary + (interval - 1) * rhythm),
        );
  const totalSlots = intervalCount * input.fieldSlots;
  const matchOnly = matchOnlyIds(input, ids);
  const maximums = futureMaximums(input, ids, remaining);
  const maximumIntervals = Object.fromEntries(
    ids.map((id) => [
      id,
      input.maximumFutureActualMsByPlayer?.[id] === undefined
        ? intervalCount
        : Math.ceil(maximums[id]! / rhythm),
    ]),
  ) as Record<PlayerId, number>;
  const priority = (a: PlayerId, b: PlayerId) =>
    amount(matchOnly.has(a) ? currentMatch.balances : initialBalances, a) -
      amount(matchOnly.has(b) ? currentMatch.balances : initialBalances, b) ||
    orderIndex(ids, a) - orderIndex(ids, b);
  const counts = Object.fromEntries(
    ids.map((id) => [
      id,
      Math.min(Math.floor(totalSlots / ids.length), maximumIntervals[id]!),
    ]),
  ) as Record<PlayerId, number>;
  let missingSlots =
    totalSlots - Object.values(counts).reduce((total, count) => total + count, 0);
  const assignSlots = (limit: (id: PlayerId) => number) => {
    for (const id of [...ids].sort(priority)) {
      if (missingSlots === 0) break;
      if (counts[id]! >= limit(id)) continue;
      counts[id] = counts[id]! + 1;
      missingSlots -= 1;
    }
  };
  const lowIntervalCount = Math.floor(totalSlots / ids.length);
  assignSlots((id) => Math.min(lowIntervalCount + 1, maximumIntervals[id]!));
  while (missingSlots > 0) {
    const before = missingSlots;
    assignSlots((id) => maximumIntervals[id]!);
    if (missingSlots === before) break;
  }
  /*
   * Grid slots are intentionally indivisible. When caps cannot fill enough
   * complete slots, relax only the slots that must be filled.
   */
  while (missingSlots > 0) {
    for (const id of [...ids].sort(priority)) {
      if (missingSlots === 0) break;
      if (counts[id]! >= intervalCount) continue;
      counts[id] = counts[id]! + 1;
      missingSlots -= 1;
    }
  }
  if (missingSlots > 0) return undefined;

  let lineup = [...input.currentLineupIds];
  const steps: PlannerPreviewStep[] = [];
  for (const id of lineup) {
    if (counts[id]! >= 1) continue;
    counts[id] = 1;
    const replacement = [...ids]
      .filter(
        (candidate) =>
          candidate !== id &&
          counts[candidate]! > 0 &&
          (!lineup.includes(candidate) || counts[candidate]! > 1),
      )
      .sort((a, b) => counts[b]! - counts[a]! || priority(b, a))[0];
    if (replacement) counts[replacement] = counts[replacement]! - 1;
  }
  for (const id of ids.filter((id) => !lineup.includes(id))) {
    while (counts[id]! > intervalCount - 1) {
      const replacement = [...lineup].sort(
        (a, b) => counts[a]! - counts[b]! || priority(a, b),
      )[0];
      if (!replacement) break;
      counts[id] = counts[id]! - 1;
      counts[replacement] = counts[replacement]! + 1;
    }
  }

  const used = copyTotals(ids, {});
  const allocated = copyTotals(ids, {});
  const balanceForCycle = (id: PlayerId) =>
    amount(matchOnly.has(id) ? currentMatch.balances : initialBalances, id);
  const cyclicCounts = copyTotals(ids, {});
  for (let interval = 0; interval < intervalCount; interval += 1) {
    for (let slot = 0; slot < input.fieldSlots; slot += 1) {
      const id = ids[(interval + slot) % ids.length]!;
      cyclicCounts[id] = cyclicCounts[id]! + 1;
    }
  }
  /*
   * When the children have equivalent starting fairness and the cyclic ring
   * fulfils the assigned slot counts, rotating one place is the fairest
   * tie-break: it bounds initial bench waits and prevents immediate returns.
   */
  const useCyclicRing =
    lineup.every((id, index) => id === ids[index]) &&
    ids.every(
      (id) => Math.abs(balanceForCycle(id) - balanceForCycle(ids[0]!)) < 1e-7,
    ) &&
    ids.every((id) => counts[id] === cyclicCounts[id]);
  /*
   * A child who came on between two boundaries (manual change) has not had a
   * full interval yet, so they stay on at the next boundary rather than being
   * taken straight back off. Likewise a child just taken off is not the first
   * choice to come straight back on.
   */
  const enteredAt = Object.fromEntries(
    lineup.map((id) => [
      id,
      input.nowElapsedMs - amount(input.currentFieldStintMsByPlayer, id),
    ]),
  ) as Record<PlayerId, number>;
  const leftAt = Object.fromEntries(
    ids
      .filter((id) => !lineup.includes(id))
      .map((id) => [
        id,
        input.nowElapsedMs - amount(input.currentBenchStintMsByPlayer ?? {}, id),
      ]),
  ) as Record<PlayerId, number>;
  for (let interval = 0; interval < intervalCount; interval += 1) {
    if (interval > 0) {
      const dueAtElapsedMs = nextBoundary + (interval - 1) * rhythm;
      const lineupBefore = lineup;
      const retained = retainedFixedStep(input, dueAtElapsedMs, lineup, ids);
      if (retained) {
        steps.push(retained);
        lineup = [...retained.lineupAfterIds];
      } else if (useCyclicRing) {
        const outgoingPlayerId = ids[(interval - 1) % ids.length]!;
        const incomingPlayerId = ids[(interval - 1 + input.fieldSlots) % ids.length]!;
        if (!lineup.includes(outgoingPlayerId) || lineup.includes(incomingPlayerId))
          return undefined;
        const nextLineup = [
          ...lineup.filter((id) => id !== outgoingPlayerId),
          incomingPlayerId,
        ];
        steps.push({
          dueAtElapsedMs,
          lineupBeforeIds: lineup,
          lineupAfterIds: nextLineup,
          swaps: [{ outgoingPlayerId, incomingPlayerId }],
        });
        lineup = nextLineup;
      } else {
        const remainingIntervals = intervalCount - interval;
        const residual = (id: PlayerId) => counts[id]! - used[id]!;
        const fresh = (id: PlayerId) =>
          lineup.includes(id) && dueAtElapsedMs - enteredAt[id]! < rhythm;
        const justLeft = (id: PlayerId) =>
          !lineup.includes(id) && dueAtElapsedMs - (leftAt[id] ?? -Infinity) < rhythm;
        for (const id of lineup.filter((id) => fresh(id) && residual(id) === 0)) {
          const forcedCount = ids.filter(
            (other) => residual(other) === remainingIntervals,
          ).length;
          const donor = lineup
            .filter((other) => !fresh(other) && residual(other) > 0)
            .sort(
              (a, b) =>
                Number(residual(a) === remainingIntervals) -
                  Number(residual(b) === remainingIntervals) ||
                residual(a) - residual(b) ||
                priority(b, a),
            )[0];
          if (!donor) continue;
          const forcedAfter =
            forcedCount +
            (remainingIntervals === 1 ? 1 : 0) -
            (residual(donor) === remainingIntervals ? 1 : 0);
          if (forcedAfter > input.fieldSlots) continue;
          counts[id] = counts[id]! + 1;
          counts[donor] = counts[donor]! - 1;
        }
        const forced = ids.filter((id) => residual(id) === remainingIntervals);
        if (forced.length > input.fieldSlots) return undefined;
        const selectable = ids.filter((id) => residual(id) > 0);
        if (selectable.length < input.fieldSlots) return undefined;
        const selected = new Set(forced);
        const current = lineup.filter(
          (id) => selectable.includes(id) && !selected.has(id),
        );
        const bench = selectable.filter(
          (id) => !lineup.includes(id) && !selected.has(id),
        );
        const settled = (id: PlayerId) => (fresh(id) || justLeft(id) ? 1 : 0);
        const ranked = (players: readonly PlayerId[], direction: 1 | -1) =>
          [...players].sort(
            (a, b) =>
              (lineup.includes(a) && lineup.includes(b)
                ? direction * (settled(b) - settled(a))
                : 0) ||
              direction * (residual(b) - residual(a)) ||
              (!lineup.includes(a) && !lineup.includes(b)
                ? settled(a) - settled(b)
                : 0) ||
              (direction === 1 ? priority(a, b) : priority(b, a)),
          );
        if (forced.length === 0 && current.length > 0 && bench.length > 0) {
          const incoming = ranked(bench, 1)[0]!;
          const outgoing = ranked(current, -1)[0]!;
          if (residual(incoming) >= residual(outgoing)) {
            selected.add(incoming);
            current.splice(current.indexOf(outgoing), 1);
          }
        }
        for (const id of ranked(current, 1)) {
          if (selected.size === input.fieldSlots) break;
          selected.add(id);
        }
        for (const id of ranked(bench, 1)) {
          if (selected.size === input.fieldSlots) break;
          selected.add(id);
        }
        if (selected.size !== input.fieldSlots) return undefined;
        const nextLineup = [
          ...lineup.filter((id) => selected.has(id)),
          ...ids.filter((id) => selected.has(id) && !lineup.includes(id)),
        ];
        const outgoing = lineup.filter((id) => !selected.has(id));
        const incoming = nextLineup.filter((id) => !lineup.includes(id));
        if (outgoing.length !== incoming.length) return undefined;
        if (outgoing.length > 0) {
          steps.push({
            dueAtElapsedMs,
            lineupBeforeIds: lineup,
            lineupAfterIds: nextLineup,
            swaps: outgoing.map((outgoingPlayerId, index) => ({
              outgoingPlayerId,
              incomingPlayerId: incoming[index]!,
            })),
          });
        }
        lineup = nextLineup;
      }
      for (const id of lineup)
        if (!lineupBefore.includes(id)) enteredAt[id] = dueAtElapsedMs;
      for (const id of lineupBefore)
        if (!lineup.includes(id)) leftAt[id] = dueAtElapsedMs;
    }
    for (const id of lineup) {
      used[id] = used[id]! + 1;
      allocated[id] = allocated[id]! + intervalDuration(interval);
    }
  }

  const allocation = allocated;
  const futureAllocationCaps: FutureAllocationCapDiagnostics = {
    capsFeasible: ids.every((id) => allocation[id]! <= maximums[id]!),
    requestedCapacityMs: Object.values(maximums).reduce(
      (total, maximum) => total + maximum,
      0,
    ),
    requiredCapacityMs: remaining * input.fieldSlots,
    allocatedFutureActualMsByPlayer: allocation,
    relaxations: ids
      .filter((id) => allocation[id]! > maximums[id]!)
      .map((id) => ({
        playerId: id,
        maximumFutureActualMs: maximums[id]!,
        allocatedFutureActualMs: allocation[id]!,
        relaxedByMs: allocation[id]! - maximums[id]!,
      })),
  };
  const fixedRhythm: FixedRhythmDiagnostics = {
    plannedIntervalCountByPlayer: used,
    intervalBalanceWithinOne: range(Object.values(used)) <= 1,
  };
  const futureIdeal = (remaining * input.fieldSlots) / ids.length;
  const projectedActual = Object.fromEntries(
    ids.map((id) => [id, amount(currentMatch.actual, id) + allocation[id]!]),
  ) as Record<PlayerId, number>;
  const projectedIdeal = Object.fromEntries(
    ids.map((id) => [id, amount(currentMatch.ideal, id) + futureIdeal]),
  ) as Record<PlayerId, number>;
  const projectedBalance = Object.fromEntries(
    ids.map((id) => [id, amount(initialBalances, id) + allocation[id]! - futureIdeal]),
  ) as Record<PlayerId, number>;
  const currentMatchDifferences = ids.map(
    (id) => projectedActual[id]! - projectedIdeal[id]!,
  );
  const maximumAbsoluteCurrentMatchDifferenceMs = Math.max(
    0,
    ...currentMatchDifferences.map(Math.abs),
  );
  const first = steps[0];
  if (!first)
    return {
      preview: [],
      diagnostics: { futureAllocationCaps, fixedRhythm },
    };
  const reasons: RecommendationReason[] = [];
  if (
    ids.every((id) => Math.abs(amount(initialBalances, id)) < 1e-7) &&
    !input.availabilityChanged &&
    !input.manualDeviation
  )
    reasons.push("normal-rotation");
  const firstSwap = first.swaps[0]!;
  if (projectedBalance[firstSwap.incomingPlayerId]! < 0)
    reasons.push("player-behind-target");
  if (projectedBalance[firstSwap.outgoingPlayerId]! > 0)
    reasons.push("player-ahead-of-target");
  if (input.availabilityChanged) reasons.push("availability-change");
  if (input.manualDeviation) reasons.push("manual-deviation");
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
      perfectTargetFeasible: maximumAbsoluteCurrentMatchDifferenceMs < 1e-7,
      currentMatchDifferencesWithinTolerance:
        maximumAbsoluteCurrentMatchDifferenceMs <= tolerance(input),
      maximumAbsoluteCurrentMatchDifferenceMs,
      expectedSubstitutionCount: steps.length,
      shortStintWarnings: first.swaps
        .filter(
          (swap) =>
            (input.currentBenchStintMsByPlayer[swap.incomingPlayerId] ?? 0) <
            input.minimumPreferredStintMs,
        )
        .map((swap) => swap.incomingPlayerId),
      futureAllocationCaps,
      fixedRhythm,
    },
  };
  return {
    recommendation,
    preview: steps,
    diagnostics: { futureAllocationCaps, fixedRhythm },
  };
}

/**
 * Locked players (for example a keeper kept for the whole match) stay on the
 * field and outside the rotation. The rotation is planned for the remaining
 * slots and the locked players are added back to every previewed lineup.
 */
export function planMatch(input: PlannerInput): PlannerResult {
  const locked = (input.lockedOnFieldPlayerIds ?? []).filter(
    (id, index, all) =>
      all.indexOf(id) === index &&
      input.currentLineupIds.includes(id) &&
      input.orderedAvailablePlayerIds.includes(id),
  );
  if (locked.length === 0) return planRotation(input);
  const lockedSet = new Set(locked);
  const strip = (ids: readonly PlayerId[]) => ids.filter((id) => !lockedSet.has(id));
  const restore = (ids: readonly PlayerId[]) => [...locked, ...strip(ids)];
  const inner = planRotation({
    ...input,
    fieldSlots: input.fieldSlots - locked.length,
    orderedAvailablePlayerIds: strip(input.orderedAvailablePlayerIds),
    currentLineupIds: strip(input.currentLineupIds),
    lockedOnFieldPlayerIds: [],
    ...(input.previousPreview
      ? {
          previousPreview: input.previousPreview
            .map((step) => ({
              ...step,
              lineupBeforeIds: strip(step.lineupBeforeIds),
              lineupAfterIds: strip(step.lineupAfterIds),
              swaps: step.swaps.filter(
                (swap) =>
                  !lockedSet.has(swap.outgoingPlayerId) &&
                  !lockedSet.has(swap.incomingPlayerId),
              ),
            }))
            .filter((step) => step.swaps.length > 0),
        }
      : {}),
  });
  return {
    ...inner,
    preview: inner.preview.map((step) => ({
      ...step,
      lineupBeforeIds: restore(step.lineupBeforeIds),
      lineupAfterIds: restore(step.lineupAfterIds),
    })),
  };
}

function planRotation(input: PlannerInput): PlannerResult {
  const ids = [...input.orderedAvailablePlayerIds];
  const remaining = input.plannedEndElapsedMs - input.nowElapsedMs;
  const currentMatch = matchTotals(input, ids);
  const matchOnly = matchOnlyIds(input, ids);
  if (
    !Number.isInteger(input.nowElapsedMs) ||
    !Number.isInteger(input.plannedEndElapsedMs) ||
    remaining <= 0 ||
    input.fieldSlots <= 0 ||
    input.fieldSlots > ids.length ||
    new Set(ids).size !== ids.length
  )
    return {
      preview: [],
      diagnostics: {
        futureAllocationCaps: {
          capsFeasible: true,
          requestedCapacityMs: 0,
          requiredCapacityMs: 0,
          allocatedFutureActualMsByPlayer: {},
          relaxations: [],
        },
      },
    };

  const initialBalances = Object.fromEntries(
    ids.map((id) => [
      id,
      matchOnly.has(id)
        ? amount(currentMatch.balances, id)
        : amount(input.balancesMsByPlayer, id),
    ]),
  ) as Record<PlayerId, number>;
  const initialAllocation = allocateFuture(
    input,
    initialBalances,
    currentMatch.balances,
    remaining,
    ids,
    matchOnly,
  );
  const futureAllocationCaps = capDiagnostics(
    initialAllocation,
    futureMaximums(input, ids, remaining),
    remaining * input.fieldSlots,
  );
  const fixedPlan = fixedRhythmPlan(input, ids, currentMatch, initialBalances);
  if (fixedPlan) return fixedPlan;
  if (fixedSubstitutionRhythm(input) !== undefined)
    return {
      preview: [],
      diagnostics: {
        futureAllocationCaps,
        fixedRhythm: {
          plannedIntervalCountByPlayer: copyTotals(ids, {}),
          intervalBalanceWithinOne: true,
        },
      },
    };
  const simulation: Simulation = {
    now: input.nowElapsedMs,
    end: input.plannedEndElapsedMs,
    lineup: [...input.currentLineupIds],
    balances: copyTotals(ids, initialBalances),
    currentMatchBalances: copyTotals(ids, currentMatch.balances),
    currentMatchActual: copyTotals(ids, currentMatch.actual),
    futureAllocatedMs: copyTotals(ids, {}),
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
  if (!first) return { preview: [], diagnostics: { futureAllocationCaps } };

  const allocation = initialAllocation.allocationMsByPlayer;
  const futureIdeal = (remaining * input.fieldSlots) / ids.length;
  const projectedActual = Object.fromEntries(
    ids.map((id) => [id, amount(currentMatch.actual, id) + amount(allocation, id)]),
  ) as Record<PlayerId, number>;
  const projectedIdeal = Object.fromEntries(
    ids.map((id) => [id, amount(currentMatch.ideal, id) + futureIdeal]),
  ) as Record<PlayerId, number>;
  const projectedBalance = Object.fromEntries(
    ids.map((id) => [
      id,
      amount(initialBalances, id) + amount(allocation, id) - futureIdeal,
    ]),
  ) as Record<PlayerId, number>;
  const currentMatchDifferences = ids.map(
    (id) => amount(projectedActual, id) - amount(projectedIdeal, id),
  );
  const maximumAbsoluteCurrentMatchDifferenceMs = Math.max(
    0,
    ...currentMatchDifferences.map(Math.abs),
  );
  const perfectTargetFeasible = maximumAbsoluteCurrentMatchDifferenceMs < 1e-7;
  const currentMatchDifferencesWithinTolerance =
    maximumAbsoluteCurrentMatchDifferenceMs <= tolerance(input);
  const hasUnequalBalances = ids.some(
    (id) => Math.abs(amount(initialBalances, id)) > 1e-7,
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
      currentMatchDifferencesWithinTolerance,
      maximumAbsoluteCurrentMatchDifferenceMs,
      expectedSubstitutionCount: simulation.steps.length,
      shortStintWarnings,
      futureAllocationCaps,
    },
  };
  return {
    recommendation,
    preview: simulation.steps,
    diagnostics: { futureAllocationCaps },
  };
}

export const planRecommendation = (input: PlannerInput): Recommendation | undefined =>
  planMatch(input).recommendation;
