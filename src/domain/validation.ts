import type { PlayerId } from "./ids";

export type ValidationResult = Readonly<{ valid: boolean; errors: readonly string[] }>;

const unique = (ids: readonly PlayerId[]) => new Set(ids).size === ids.length;

export function validateLineup(
  lineupIds: readonly PlayerId[],
  availablePlayerIds: readonly PlayerId[],
  fieldSlots: number,
): ValidationResult {
  const errors: string[] = [];
  if (!Number.isInteger(fieldSlots) || fieldSlots <= 0)
    errors.push("Field slots must be a positive integer.");
  if (!unique(lineupIds)) errors.push("Lineup contains a duplicate player.");
  if (lineupIds.length > fieldSlots) errors.push("Lineup exceeds field capacity.");
  const available = new Set(availablePlayerIds);
  if (lineupIds.some((id) => !available.has(id)))
    errors.push("Lineup contains an unavailable player.");
  return { valid: errors.length === 0, errors };
}

export function validateSubstitution(
  lineupIds: readonly PlayerId[],
  availablePlayerIds: readonly PlayerId[],
  outgoingPlayerIds: readonly PlayerId[],
  incomingPlayerIds: readonly PlayerId[],
): ValidationResult {
  const errors: string[] = [];
  if (
    outgoingPlayerIds.length !== incomingPlayerIds.length ||
    outgoingPlayerIds.length === 0
  ) {
    errors.push(
      "A substitution needs equally sized non-empty outgoing and incoming lists.",
    );
  }
  if (!unique(outgoingPlayerIds) || !unique(incomingPlayerIds))
    errors.push("A substitution contains duplicate players.");
  const lineup = new Set(lineupIds);
  const available = new Set(availablePlayerIds);
  if (outgoingPlayerIds.some((id) => !lineup.has(id)))
    errors.push("An outgoing player is not on the field.");
  if (incomingPlayerIds.some((id) => lineup.has(id) && !outgoingPlayerIds.includes(id)))
    errors.push("An incoming player is already on the field.");
  if (incomingPlayerIds.some((id) => !available.has(id)))
    errors.push("An incoming player is unavailable.");
  return { valid: errors.length === 0, errors };
}
