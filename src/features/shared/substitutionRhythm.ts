import type { MatchRecord, TournamentRecord } from "../../storage/schema";
import { formatDuration } from "../../components/format";

export const substitutionRhythmOptions = [
  { value: "90000", label: "Hvert 01:30" },
  { value: "120000", label: "Hvert 02:00" },
  { value: "150000", label: "Hvert 02:30" },
  { value: "180000", label: "Hvert 03:00" },
] as const;

export function parseSubstitutionInterval(value: string): number | undefined {
  if (!value) return undefined;
  const milliseconds = Number(value);
  if (!Number.isInteger(milliseconds) || milliseconds <= 0) {
    throw new Error("Ugyldig bytterytme.");
  }
  return milliseconds;
}

export function effectiveSubstitutionInterval(
  match: MatchRecord,
  tournament: TournamentRecord,
): number | undefined {
  if (match.substitutionIntervalMs === null) return undefined;
  return match.substitutionIntervalMs ?? tournament.defaultSubstitutionIntervalMs;
}

export function substitutionRhythmLabel(
  match: MatchRecord,
  tournament: TournamentRecord,
): string {
  const interval = effectiveSubstitutionInterval(match, tournament);
  return interval
    ? `Fast rytme ${formatDuration(interval)}`
    : "Adaptiv rettferdig rytme";
}
