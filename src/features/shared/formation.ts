import {
  addExposure,
  formationById,
  playerId,
  projectRoles,
  roleSlotById,
  rolesAfterSubstitution,
  type Formation,
  type GoalkeeperContext,
  type GoalkeeperPolicy,
  type GoalkeeperPreference,
  type PlayerId,
  type PositionExposure,
  type PositionMove,
  type RoleAssignment,
} from "../../domain";
import { toDomainEvents } from "../../storage/domainAdapter";
import type { FairPlayRepository, TournamentBundle } from "../../storage/repository";
import type {
  MatchEventRecord,
  MatchRecord,
  PlayerRecord,
  TournamentRecord,
} from "../../storage/schema";

export const goalkeeperPolicyOptions = [
  { value: "fixed", label: "Samme keeper hele kampen" },
  { value: "rotating", label: "Keeper byttes som de andre" },
] as const;

export const goalkeeperPreferenceOptions = [
  { value: "willing", label: "Kan stå i mål" },
  { value: "prefer-not", label: "Helst ikke i mål" },
  { value: "unavailable", label: "Ikke i mål" },
] as const;

/** A match without its own choice follows the match day's formation when sizes agree. */
export function effectiveFormation(
  match: Pick<MatchRecord, "formationId" | "playersOnField">,
  tournament: Pick<TournamentRecord, "defaultFormationId">,
): Formation | undefined {
  if (match.formationId === null) return undefined;
  const formation = formationById(match.formationId ?? tournament.defaultFormationId);
  return formation?.playersOnField === match.playersOnField ? formation : undefined;
}

export const goalkeeperPolicy = (
  tournament: Pick<TournamentRecord, "goalkeeperPolicy">,
): GoalkeeperPolicy => tournament.goalkeeperPolicy ?? "fixed";

export function goalkeeperPreferences(
  players: readonly PlayerRecord[],
): Partial<Record<PlayerId, GoalkeeperPreference>> {
  return Object.fromEntries(
    players.map((player) => [player.id, player.goalkeeperPreference ?? "willing"]),
  );
}

export const toRoleAssignments = (
  assignments: readonly { roleSlotId: string; playerId: string }[] | undefined,
): RoleAssignment[] =>
  (assignments ?? []).map((assignment) => ({
    roleSlotId: assignment.roleSlotId,
    playerId: playerId(assignment.playerId),
  }));

export const toRoleAssignmentRecords = (assignments: readonly RoleAssignment[]) =>
  assignments.map((assignment) => ({
    roleSlotId: assignment.roleSlotId,
    playerId: String(assignment.playerId),
  }));

export function projectStoredRoles(
  formation: Formation,
  events: readonly MatchEventRecord[],
  endElapsedMs?: number,
) {
  return projectRoles(formation, toDomainEvents(events), endElapsedMs);
}

/** The formation a match was actually started with; later setting changes do not rewrite history. */
export function startedFormation(
  events: readonly MatchEventRecord[],
): Formation | undefined {
  const voided = new Set(
    events.flatMap((event) =>
      event.type === "EVENT_VOIDED" ? [event.payload.targetEventId] : [],
    ),
  );
  const started = events.find(
    (event): event is Extract<MatchEventRecord, { type: "MATCH_STARTED" }> =>
      event.type === "MATCH_STARTED" && !voided.has(event.id),
  );
  return formationById(started?.payload.formationId);
}

export type RoleStep = Readonly<{
  assignmentsBefore: readonly RoleAssignment[];
  assignmentsAfter: readonly RoleAssignment[];
  moves: readonly PositionMove[];
  goalkeeperWarning: boolean;
}>;

/** Predicts slots through a substitution list so the coach can say where each child goes. */
export function roleSteps(
  formation: Formation,
  startAssignments: readonly RoleAssignment[],
  steps: readonly Readonly<{
    swaps: readonly Readonly<{
      outgoingPlayerId: PlayerId;
      incomingPlayerId: PlayerId;
    }>[];
  }>[],
  context: GoalkeeperContext,
): RoleStep[] {
  let current: readonly RoleAssignment[] = startAssignments;
  return steps.map((step) => {
    const change = rolesAfterSubstitution(formation, current, step.swaps, context);
    const result = {
      assignmentsBefore: current,
      assignmentsAfter: change.assignments,
      moves: change.moves,
      goalkeeperWarning: change.goalkeeperWarning,
    };
    current = change.assignments;
    return result;
  });
}

export function roleLabelFor(
  formation: Formation,
  assignments: readonly RoleAssignment[],
  id: string,
): string | undefined {
  const assignment = assignments.find((candidate) => candidate.playerId === id);
  return assignment ? roleSlotById(formation, assignment.roleSlotId)?.label : undefined;
}

export function describeMoves(
  formation: Formation,
  moves: readonly PositionMove[],
  players: readonly Pick<PlayerRecord, "id" | "name">[],
): string[] {
  return moves.map(
    (move) =>
      `${players.find((player) => player.id === move.playerId)?.name ?? "Ukjent"} flytter til ${(
        roleSlotById(formation, move.toRoleSlotId)?.label ?? "ny plass"
      ).toLocaleLowerCase("nb-NO")}`,
  );
}

/** Position exposure from started matches that were played with a formation. */
export async function calculatePositionExposure(
  repository: FairPlayRepository,
  bundle: TournamentBundle,
  beforeMatchOrder?: number,
): Promise<PositionExposure> {
  const included = bundle.matches.filter(
    (match) =>
      match.status !== "scheduled" &&
      match.status !== "ready" &&
      (beforeMatchOrder === undefined || match.order < beforeMatchOrder),
  );
  const exposures = await Promise.all(
    included.map(async (match) => {
      const events = await repository.getMatchEvents(match.id);
      const formation = startedFormation(events);
      return formation ? projectStoredRoles(formation, events).exposureMsByPlayer : {};
    }),
  );
  return addExposure(...exposures);
}
