import type { PlayerId } from "./ids";

export type FairnessTotals = Readonly<{
  actualMsByPlayer: Readonly<Record<PlayerId, number>>;
  idealMsByPlayer: Readonly<Record<PlayerId, number>>;
  balanceMsByPlayer: Readonly<Record<PlayerId, number>>;
}>;

export const emptyPlayerTotals = (
  playerIds: readonly PlayerId[],
): Record<PlayerId, number> => Object.fromEntries(playerIds.map((id) => [id, 0]));

export function balancesFromTotals(
  actualMsByPlayer: Readonly<Record<PlayerId, number>>,
  idealMsByPlayer: Readonly<Record<PlayerId, number>>,
  playerIds: readonly PlayerId[],
): Record<PlayerId, number> {
  return Object.fromEntries(
    playerIds.map((id) => [
      id,
      (actualMsByPlayer[id] ?? 0) - (idealMsByPlayer[id] ?? 0),
    ]),
  );
}

export function addFairnessInterval(
  actualMsByPlayer: Record<PlayerId, number>,
  idealMsByPlayer: Record<PlayerId, number>,
  lineupIds: readonly PlayerId[],
  availablePlayerIds: readonly PlayerId[],
  durationMs: number,
  fieldSlots: number,
): void {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return;
  for (const id of lineupIds)
    actualMsByPlayer[id] = (actualMsByPlayer[id] ?? 0) + durationMs;
  if (availablePlayerIds.length === 0) return;
  const idealRate =
    availablePlayerIds.length >= fieldSlots
      ? fieldSlots / availablePlayerIds.length
      : 1;
  for (const id of availablePlayerIds)
    idealMsByPlayer[id] = (idealMsByPlayer[id] ?? 0) + durationMs * idealRate;
}

export const fairnessTotals = (
  playerIds: readonly PlayerId[],
  actualMsByPlayer: Readonly<Record<PlayerId, number>>,
  idealMsByPlayer: Readonly<Record<PlayerId, number>>,
): FairnessTotals => ({
  actualMsByPlayer,
  idealMsByPlayer,
  balanceMsByPlayer: balancesFromTotals(actualMsByPlayer, idealMsByPlayer, playerIds),
});
