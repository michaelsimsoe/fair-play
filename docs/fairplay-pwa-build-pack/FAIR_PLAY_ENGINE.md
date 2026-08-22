# Fair-Play Engine

## 1. Objective

The engine must distribute available field time as equally as practical while respecting what actually happened.

It has two independent responsibilities:

1. **Fairness accounting:** calculate actual time, ideal availability-adjusted time, and each player's balance.
2. **Future planning:** allocate the remaining field time and turn that allocation into practical substitution recommendations.

Past history is immutable from the planner's perspective. It may compensate later; it may not rewrite earlier events.

## 2. Fairness accounting

For each active timeline interval of duration `d`:

- `K` = number of field slots.
- `A` = players marked available.
- `L` = actual on-field lineup.

Actual increment:

```text
actual[player] += d
for every player in L
```

Ideal increment when `|A| >= K`:

```text
ideal[player] += d × K / |A|
for every player in A
```

Balance:

```text
balance[player] = actual[player] - ideal[player]
```

Interpretation:

- Negative: the player is owed time relative to availability.
- Positive: the player has received extra time.
- Zero: exactly on target.

The ideal calculation means a player absent for an entire match does not return with a debt for time when they were unavailable. A player temporarily unavailable does not accumulate target time during that interval.

For the normal scenario with four available players and three slots:

```text
ideal rate per player = 3 / 4
```

Over twelve minutes, each player's ideal is nine minutes.

## 3. Tournament versus match scope

### Tournament scope — default

Use cumulative balances from all matches in the tournament. This lets later matches compensate for unavoidable differences in earlier matches.

### Match-only scope

Reset starting balances to zero at match start. Still use current-match availability-adjusted ideal time.

The selected scope is stored in the tournament/match configuration and included in planner diagnostics.

## 4. Remaining-time allocation

At a planning moment:

- `E` = currently available players.
- `n = |E|`.
- `K` = field slots.
- `R` = remaining active match time.
- `b_i` = each player's current fairness balance in the selected scope.
- `x_i` = future actual playing time to allocate to player `i`.

Constraints:

```text
0 <= x_i <= R
sum(x_i) = K × R
```

The ideal future increment is equal for every currently available player:

```text
futureIdeal = K × R / n
```

Because that value is equal for all players, minimizing the spread of final balances is equivalent to equalizing:

```text
b_i + x_i
```

subject to the bounds.

### Bounded water-filling solution

Find a level `L` such that:

```text
x_i = clamp(L - b_i, 0, R)
sum(x_i) = K × R
```

This is a bounded water-filling problem.

Implement it as a pure deterministic function. Binary search is acceptable:

```ts
function allocateRemaining(
  balances: Record<PlayerId, number>,
  remainingMs: number,
  fieldSlots: number,
  orderedPlayerIds: PlayerId[],
): Record<PlayerId, number> {
  const capacity = remainingMs * fieldSlots;

  // Find a level for which the clamped allocations consume capacity.
  // Use enough iterations for sub-millisecond numerical accuracy.
  // Convert to integer milliseconds at the end.
}
```

### Integer rounding

Persist and schedule integer milliseconds.

After calculating floating allocations:

1. Floor each allocation.
2. Compute the remaining integer milliseconds required to reach exactly `K × R`.
3. Distribute one millisecond at a time by largest fractional remainder.
4. Break ties by stable player order.
5. Assert every allocation is within `[0, R]`.
6. Assert the exact sum equals capacity.

Do not allow floating-point drift to create or destroy field time.

## 5. Normal cyclic plan

When starting balances are equal and the initial lineup contains `K` of `n` players, the deterministic normal plan is a cyclic rotation.

Construct an ordered ring:

```text
ring = selected starters in user order + bench players in deterministic order
```

Divide the match into `n` equal-duration conceptual segments:

```text
segment duration = match duration / n
```

For segment `s`, use `K` consecutive players in the ring:

```text
lineup(s) = ring[s], ring[s+1], ..., ring[s+K-1] mod n
```

Each segment transition removes one player and adds one player when `K < n`.

Every player appears in exactly `K` of the `n` segments and therefore receives:

```text
K × duration / n
```

For four players, three slots, and twelve minutes:

```text
segment = 12:00 / 4 = 3:00
target per player = 3 × 3:00 = 9:00
```

With ring `[Ask, Ali, Fredrik H, Lucas]`:

```text
00:00–03:00  Ask, Ali, Fredrik H
03:00–06:00  Ali, Fredrik H, Lucas
06:00–09:00  Fredrik H, Lucas, Ask
09:00–12:00  Lucas, Ask, Ali
```

Recommendations:

```text
03:00 Lucas in, Ask out
06:00 Ask in, Ali out
09:00 Ali in, Fredrik H out
```

The adaptive planner should naturally reproduce this plan through its tie-breaking, and the exact sequence is an acceptance test.

## 6. Adaptive sequencing

The allocator says how much future time each player should receive. The sequencer decides when to change and whom to swap.

### Inputs

```ts
type PlannerInput = {
  nowElapsedMs: number;
  plannedEndElapsedMs: number;
  fieldSlots: number;
  orderedAvailablePlayerIds: PlayerId[];
  currentLineupIds: PlayerId[];
  balancesMsByPlayer: Record<PlayerId, number>;
  currentFieldStintMsByPlayer: Record<PlayerId, number>;
  currentBenchStintMsByPlayer: Record<PlayerId, number>;
  minimumPreferredStintMs: number;
  preferredChangeIntervalMs: number;
  previousRecommendation?: Recommendation;
};
```

Default:

```text
preferredChangeInterval = full planned match duration / available player count
```

This default produces the cyclic plan for equal balances.

### Feasibility timing

Let `need_i` be the allocated future actual time for player `i`.

For a bench player `j`, the latest they can remain on the bench before even a continuous final stint becomes insufficient is:

```text
latestEntryDelay_j = R - need_j
```

For an on-field player `i`, the maximum they can remain continuously on the field without exceeding their allocation is:

```text
maxStayDelay_i = need_i
```

A fairness-exact next boundary therefore cannot be later than:

```text
min(
  preferredChangeInterval,
  minimum latestEntryDelay among bench players,
  minimum maxStayDelay among on-field players,
  R
)
```

Values at or below zero imply an immediate boundary.

### Advance and choose

At a simulated boundary after delay `d`:

1. Subtract `d` from the future need of each current on-field player.
2. Reduce `R` by `d`.
3. Choose incoming candidates by:
   - Highest `need / R`.
   - Most negative projected balance.
   - Longest current bench stint.
   - Stable player order.
4. Choose outgoing candidates by:
   - Lowest `need / R`.
   - Most positive projected balance.
   - Longest current field stint.
   - Avoid removing a just-entered player when another choice is equivalent.
   - Stable player order.
5. Swap one pair.
6. If several players are simultaneously forced by zero slack/need, allow a substitution batch.
7. Continue simulation to produce a preview, but expose only the first action as the live recommendation.

The production implementation may use a bounded deterministic beam search around these candidate choices if that improves short-stint behavior. It must remain pure, deterministic, and well tested.

## 7. Practical constraints

Fairness is the primary objective, but a plan with many tiny stints is poor for young children.

Soft constraints:

- Default preferred minimum stint: 60 seconds.
- Avoid taking a player off less than the preferred minimum after they entered.
- Avoid putting a player in for a final stint shorter than 45 seconds merely to improve the balance by a trivial amount.
- Prefer fewer substitutions when fairness outcomes are equivalent.
- Prefer not to leave one player on the bench for more than roughly twice the normal change interval when alternatives are equivalent.
- Do not propose simultaneous multi-player changes unless required or clearly better.
- Do not replace an immediate fairness-critical swap with a long wait merely to satisfy a soft minimum stint.

A useful terminal plan score, lexicographically or by safely separated weights, is:

1. Lowest final fairness-balance range.
2. Lowest maximum absolute balance.
3. Fewest infeasible target milliseconds.
4. Fewest sub-minimum stints.
5. Lowest maximum bench stint.
6. Fewest substitutions.
7. Stable deterministic tie-break.

Do not conceal a fairness sacrifice. Planner diagnostics should report the projected result.

## 8. Recommendation structure

```ts
type Recommendation = {
  id: string;
  calculatedAtElapsedMs: number;
  dueAtElapsedMs: number;
  swaps: Array<{
    outgoingPlayerId: PlayerId;
    incomingPlayerId: PlayerId;
  }>;
  projectedActualMsByPlayer: Record<PlayerId, number>;
  projectedIdealMsByPlayer: Record<PlayerId, number>;
  projectedBalanceMsByPlayer: Record<PlayerId, number>;
  projectedBalanceRangeMs: number;
  reasons: Array<
    | "normal-rotation"
    | "player-behind-target"
    | "player-ahead-of-target"
    | "availability-change"
    | "manual-deviation"
    | "short-time-remaining"
  >;
  diagnostics: {
    perfectTargetFeasible: boolean;
    expectedSubstitutionCount: number;
    shortStintWarnings: PlayerId[];
  };
};
```

A recommendation ID can be stored in the confirmed event for audit, but the recommendation itself does not need to be permanent history.

## 9. Delayed substitution example

Initial plan:

- Ask, Ali, and Fredrik H start.
- Lucas should enter for Ask at 03:00.

Suppose the coach confirms that change at 03:27.

At 03:27:

- Ask, Ali, Fredrik H actual: 03:27 each.
- Lucas actual: 00:00.
- Each player's ideal: 02:35.25.
- Balances:
  - Ask: +00:51.75
  - Ali: +00:51.75
  - Fredrik H: +00:51.75
  - Lucas: -02:35.25

There are 08:33 left. Lucas must play the entire remainder to get as close as possible. Exact 09:00 each is no longer feasible in this match because Lucas cannot recover the 27 seconds already missed.

The optimal raw final actual totals are approximately:

- Lucas: 08:33
- Each other player: 09:09

The ideal final target remains 09:00 each, producing:

- Lucas balance: -00:27
- Each other player balance: +00:09

The balance range is 36 seconds. The next match should favor Lucas by carrying this balance forward.

The app must not pretend the first change happened at 03:00.

## 10. Manual substitution example

At 04:10, Fredrik H asks to leave, although the recommendation says Ask out and Lucas in.

The coach records:

```text
Lucas in, Fredrik H out at 04:10
```

The engine:

1. Appends that actual event.
2. Projects the real lineup.
3. Recalculates balances.
4. Allocates the remaining field time.
5. Generates a new next action.

It does not force the old plan or edit the event time.

## 11. Availability example

Lucas becomes temporarily unavailable at 05:00 while on the bench.

From 05:00 onward:

- Lucas is excluded from the available set.
- Lucas receives no ideal-time increment.
- The remaining three players can occupy all three field slots.
- No substitution is required while only those three are available.

Lucas becomes available again at 08:00:

- Lucas begins accumulating ideal target time again.
- The planner evaluates current balances from that moment.
- The three unavailable minutes are not owed automatically.

## 12. Edge cases

The engine must handle:

- `available count == field slots`: all available players play; no recommendation.
- `available count < field slots`: warn; all available players play; empty slots are not invented.
- `field slots <= 0`: validation error.
- `field slots > roster size`: validation error or explicit warning before match.
- Zero remaining time: no substitution.
- Immediate recommendation at match start due carried fairness debt.
- Multiple events at the same elapsed time using sequence order.
- Manual substitution inconsistent with current lineup: reject before persistence.
- Incoming player already on field: reject.
- Outgoing player not on field: reject.
- Unavailable incoming player: reject unless availability is changed in the same command transaction.
- Batch substitution with duplicate IDs: reject.
- Overtime that changes remaining allocation.
- Voided/replaced event that makes later events invalid: surface projection issues.
- Numerical rounding while preserving exact total player-milliseconds.
- Stable tie-breaking across reloads and browsers.

## 13. Required unit tests

At minimum:

1. Four players, three slots, twelve minutes, equal balances:
   - 03:00 Lucas for Ask.
   - 06:00 Ask for Ali.
   - 09:00 Ali for Fredrik H.
   - 09:00 final actual per player.
2. Five players, three slots, twelve minutes:
   - 07:12 target per player.
   - Practical cyclic changes.
   - Exact total of 36 player-minutes.
3. Six players, three slots, twelve minutes:
   - 06:00 target per player.
4. No bench:
   - No recommendation.
5. First change confirmed 27 seconds late:
   - Actual history uses 03:27.
   - Planner detects perfect current-match equality is impossible.
   - Projected balances are optimal or within a one-second deterministic tolerance.
6. Next match uses carried balance to compensate.
7. Player absent for one match:
   - No ideal time accrues while absent.
   - No whole-match catch-up debt is created.
8. Temporary unavailability:
   - Ideal target pauses for that player.
9. Manual substitution:
   - New plan starts from real lineup.
10. Pause:

- Neither actual nor ideal time changes during the pause.

11. Integer allocator:

- Exact capacity sum for randomized valid inputs.
- Every allocation is within bounds.

12. Determinism:

- Repeated calls with identical input produce deeply equal output.

13. Short-time remainder:

- Avoid a useless micro-stint when fairness improvement is below configured tolerance.

14. Batch-forced case:

- No duplicate or invalid lineup.
