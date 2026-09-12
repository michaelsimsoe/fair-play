import { playerId, projectMatch, type MatchProjection } from "../../domain";
import type { FairPlayRepository, TournamentBundle } from "../../storage/repository";
import { toDomainConfiguration, toDomainEvents } from "../../storage/domainAdapter";
import type { MatchEventRecord, MatchRecord, PlayerRecord } from "../../storage/schema";

export type MatchData = {
  match: MatchRecord;
  tournamentBundle: TournamentBundle;
  events: MatchEventRecord[];
};

export async function loadMatchData(
  repository: FairPlayRepository,
  matchId: string,
): Promise<MatchData> {
  const match = await repository.getMatch(matchId);
  if (!match) throw new Error("Kampen finnes ikke.");
  const [tournamentBundle, events] = await Promise.all([
    repository.getTournamentBundle(match.tournamentId),
    repository.getMatchEvents(match.id),
  ]);
  if (!tournamentBundle) throw new Error("Spilldagen finnes ikke.");
  return { match, tournamentBundle, events };
}

export function projectStoredMatch(
  match: MatchRecord,
  events: readonly MatchEventRecord[],
  endElapsedMs?: number,
): MatchProjection {
  return projectMatch(
    toDomainConfiguration(match),
    toDomainEvents(events),
    endElapsedMs === undefined ? {} : { endElapsedMs },
  );
}

export type PlayerTournamentTotals = Record<
  string,
  { actualMs: number; idealMs: number; balanceMs: number }
>;

export async function calculateTournamentTotals(
  repository: FairPlayRepository,
  bundle: TournamentBundle,
  beforeMatchOrder?: number,
): Promise<PlayerTournamentTotals> {
  const totals = Object.fromEntries(
    bundle.players.map((player) => [
      player.id,
      { actualMs: 0, idealMs: 0, balanceMs: 0 },
    ]),
  );
  const includedMatches = bundle.matches.filter(
    (match) =>
      match.status !== "scheduled" &&
      match.status !== "ready" &&
      (beforeMatchOrder === undefined || match.order < beforeMatchOrder),
  );
  const histories = await Promise.all(
    includedMatches.map(async (match) => ({
      match,
      events: await repository.getMatchEvents(match.id),
    })),
  );
  const projectedMatches = histories.map(({ match, events }) => ({
    match,
    projection: projectStoredMatch(match, events),
  }));

  for (const { projection } of projectedMatches) {
    for (const player of bundle.players) {
      const total = totals[player.id];
      if (!total || player.membership === "guest") continue;
      const id = playerId(player.id);
      total.actualMs += projection.actualMsByPlayer[id] ?? 0;
      total.idealMs += projection.idealMsByPlayer[id] ?? 0;
      total.balanceMs = total.actualMs - total.idealMs;
    }
  }
  const projectionByMatchId = new Map(
    projectedMatches.map(({ match, projection }) => [match.id, projection]),
  );
  for (const player of bundle.players) {
    if (player.membership === "guest") continue;
    const total = totals[player.id];
    if (!total) continue;
    total.balanceMs += player.fairnessAdjustments
      .filter((adjustment) => {
        const projection = projectionByMatchId.get(adjustment.matchId);
        return projection && adjustment.elapsedMs <= projection.elapsedMs;
      })
      .reduce((sum, adjustment) => sum + adjustment.amountMs, 0);
  }
  return totals;
}

export function fairnessAdjustmentForMatch(
  player: PlayerRecord,
  matchId: string,
  elapsedMs: number,
): number {
  return player.fairnessAdjustments
    .filter(
      (adjustment) =>
        adjustment.matchId === matchId && adjustment.elapsedMs <= elapsedMs,
    )
    .reduce((sum, adjustment) => sum + adjustment.amountMs, 0);
}

export function playerName(
  players: readonly Pick<PlayerRecord, "id" | "name">[],
  playerId: string,
): string {
  return players.find((player) => player.id === playerId)?.name ?? "Ukjent spiller";
}

export function currentIntervalDuration(
  intervals: readonly { startElapsedMs: number; endElapsedMs: number }[] | undefined,
  elapsedMs: number,
): number {
  if (!intervals) return 0;
  for (let index = intervals.length - 1; index >= 0; index -= 1) {
    const interval = intervals[index];
    if (interval?.endElapsedMs === elapsedMs) {
      return elapsedMs - interval.startElapsedMs;
    }
  }
  return 0;
}

export function lastPlanningElapsed(events: readonly MatchEventRecord[]): number {
  return (
    events
      .filter((event) =>
        [
          "MATCH_STARTED",
          "SUBSTITUTION_CONFIRMED",
          "LINEUP_SYNCHRONIZED",
          "PLAYER_AVAILABILITY_CHANGED",
          "MATCH_DURATION_CHANGED",
        ].includes(event.type),
      )
      .at(-1)?.elapsedMs ?? 0
  );
}
