import type { MatchRecord } from "../../storage/schema";

export type ParticipationPauseScope = "none" | "current" | "through-next" | "rest-day";

export function participationPauseMatchIds(
  matches: readonly MatchRecord[],
  currentMatch: MatchRecord,
  scope: ParticipationPauseScope,
): string[] {
  if (scope === "none") return [];
  const remainingMatches = [...matches]
    .filter(
      (match) =>
        match.order >= currentMatch.order &&
        match.status !== "completed" &&
        match.status !== "abandoned",
    )
    .sort((left, right) => left.order - right.order);
  if (scope === "current") return [currentMatch.id];
  if (scope === "through-next") {
    return remainingMatches.slice(0, 2).map((match) => match.id);
  }
  return remainingMatches.map((match) => match.id);
}
