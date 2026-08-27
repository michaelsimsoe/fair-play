import type { PlayerId } from "./ids";

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/**
 * Integer bounded water-filling. The returned player milliseconds always sum
 * to exactly `fieldSlots * remainingMs`; no fractional field time is lost.
 */
export function allocateRemaining(
  balancesMsByPlayer: Readonly<Record<PlayerId, number>>,
  remainingMs: number,
  fieldSlots: number,
  orderedPlayerIds: readonly PlayerId[],
): Record<PlayerId, number> {
  if (!Number.isInteger(remainingMs) || remainingMs < 0)
    throw new RangeError("remainingMs must be a non-negative integer.");
  if (!Number.isInteger(fieldSlots) || fieldSlots < 0)
    throw new RangeError("fieldSlots must be a non-negative integer.");
  if (new Set(orderedPlayerIds).size !== orderedPlayerIds.length)
    throw new RangeError("Player order must not contain duplicates.");
  if (fieldSlots > orderedPlayerIds.length)
    throw new RangeError("Field capacity exceeds available player capacity.");
  return allocateBoundedCapacity(
    balancesMsByPlayer,
    remainingMs * fieldSlots,
    remainingMs,
    orderedPlayerIds,
  );
}

/**
 * Integer bounded water-filling with an explicit total capacity. This is used
 * when match-only players have first claimed their current-match target.
 */
export function allocateBoundedCapacity(
  balancesMsByPlayer: Readonly<Record<PlayerId, number>>,
  capacity: number,
  maximumMsPerPlayer: number,
  orderedPlayerIds: readonly PlayerId[],
): Record<PlayerId, number> {
  if (!Number.isInteger(capacity) || capacity < 0)
    throw new RangeError("capacity must be a non-negative integer.");
  if (!Number.isInteger(maximumMsPerPlayer) || maximumMsPerPlayer < 0)
    throw new RangeError("maximumMsPerPlayer must be a non-negative integer.");
  if (new Set(orderedPlayerIds).size !== orderedPlayerIds.length)
    throw new RangeError("Player order must not contain duplicates.");
  if (capacity > maximumMsPerPlayer * orderedPlayerIds.length)
    throw new RangeError("Capacity exceeds player bounds.");
  const allocation = Object.fromEntries(
    orderedPlayerIds.map((id) => [id, 0]),
  ) as Record<PlayerId, number>;
  if (capacity === 0) return allocation;

  const balances = orderedPlayerIds.map((id) => {
    const balance = balancesMsByPlayer[id];
    if (!Number.isFinite(balance))
      throw new RangeError(`Balance for ${String(id)} must be finite.`);
    return balance;
  });
  let low = Math.min(...balances.map((balance) => balance! - maximumMsPerPlayer));
  let high = Math.max(...balances.map((balance) => balance! + maximumMsPerPlayer));
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const level = (low + high) / 2;
    const sum = balances.reduce<number>(
      (total, balance) => total + clamp(level - balance!, 0, maximumMsPerPlayer),
      0,
    );
    if (sum < capacity) low = level;
    else high = level;
  }
  const level = (low + high) / 2;
  const fractions = orderedPlayerIds.map((id, index) => {
    const raw = clamp(level - balances[index]!, 0, maximumMsPerPlayer);
    const floored = Math.floor(raw);
    allocation[id] = floored;
    return { id, remainder: raw - floored };
  });
  let missing =
    capacity - Object.values(allocation).reduce((sum, value) => sum + value, 0);
  fractions.sort(
    (a, b) =>
      b.remainder - a.remainder ||
      orderedPlayerIds.indexOf(a.id) - orderedPlayerIds.indexOf(b.id),
  );
  while (missing > 0) {
    let changed = false;
    for (const { id } of fractions) {
      if (missing === 0) break;
      if (allocation[id]! < maximumMsPerPlayer) {
        allocation[id] = allocation[id]! + 1;
        missing -= 1;
        changed = true;
      }
    }
    if (!changed) throw new Error("Unable to distribute allocation capacity.");
  }
  return allocation;
}
