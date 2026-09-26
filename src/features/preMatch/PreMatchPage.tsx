import { useMemo, useRef, useState, type FormEvent } from "react";
import { navigate } from "../../app/router";
import { useServices } from "../../app/services";
import {
  formatDuration,
  formatMatchTime,
  formatSignedDuration,
} from "../../components/format";
import { Button, Card, PageHeader, StatusPill } from "../../components/ui";
import {
  DEFAULT_COMPENSATION_TOLERANCE_MS,
  DEFAULT_MINIMUM_BENCH_REST_MS,
  DEFAULT_RETURN_COMPENSATION_CAP_MS,
  goalkeeperSlot,
  normalizeRoleAssignments,
  planMatch,
  playerId,
  suggestRoleAssignments,
  type PlayerId,
  type RoleAssignment,
} from "../../domain";
import type { ActiveMatchJournalRecord, MatchEventRecord } from "../../storage/schema";
import { calculateTournamentTotals, loadMatchData, playerName } from "../shared/data";
import {
  calculatePositionExposure,
  describeMoves,
  effectiveFormation,
  goalkeeperPolicy,
  goalkeeperPreferences,
  roleLabelFor,
  roleSteps,
  toRoleAssignmentRecords,
  toRoleAssignments,
} from "../shared/formation";
import { browserClockSource } from "../../platform/browserClockSource";
import { useAsyncData } from "../shared/hooks";
import { Pitch } from "../shared/Pitch";
import { formString } from "../shared/forms";
import {
  effectiveSubstitutionInterval,
  substitutionRhythmLabel,
} from "../shared/substitutionRhythm";

export function PreMatchPage({ matchId }: { matchId: string }) {
  const { repository } = useServices();
  const state = useAsyncData(async () => {
    const data = await loadMatchData(repository, matchId);
    const [priorTotals, priorExposure] = await Promise.all([
      calculateTournamentTotals(repository, data.tournamentBundle, data.match.order),
      calculatePositionExposure(repository, data.tournamentBundle, data.match.order),
    ]);
    return { ...data, priorTotals, priorExposure };
  }, [repository, matchId]);

  if (state.status === "loading") {
    return <main className="centered-page">Gjør klar kampen …</main>;
  }
  if (state.status === "error") throw state.error;
  return <PreMatchReady key={state.data.match.updatedAtWallMs} data={state.data} />;
}

type ReadyData = Awaited<ReturnType<typeof loadMatchData>> & {
  priorTotals: Awaited<ReturnType<typeof calculateTournamentTotals>>;
  priorExposure: Awaited<ReturnType<typeof calculatePositionExposure>>;
};

function PreMatchReady({ data }: { data: ReadyData }) {
  const { repository, audio, wakeLock } = useServices();
  const { match, tournamentBundle: bundle, priorTotals, priorExposure } = data;
  const formation = effectiveFormation(match, bundle.tournament);
  const keeperPolicy = goalkeeperPolicy(bundle.tournament);
  const [manualRoles, setManualRoles] = useState<RoleAssignment[] | undefined>(() =>
    match.selectedRoleAssignments
      ? toRoleAssignments(match.selectedRoleAssignments)
      : undefined,
  );
  const [pickedRoleSlotId, setPickedRoleSlotId] = useState<string>();
  const [pickedBenchId, setPickedBenchId] = useState<string>();
  const [players, setPlayers] = useState(bundle.players);
  const initialParticipantIds = players
    .filter(
      (player) =>
        player.active &&
        (player.membership === "team" || match.eligiblePlayerIds.includes(player.id)),
    )
    .map((player) => player.id);
  const [participantIds, setParticipantIds] = useState<string[]>(initialParticipantIds);
  const eligiblePlayers = players.filter(
    (player) => player.active && participantIds.includes(player.id),
  );
  const guestPlayers = players.filter(
    (player) => player.active && player.membership === "guest",
  );
  const recommendedIds = useMemo(
    () =>
      [...eligiblePlayers]
        .filter((player) => !player.unavailableMatchIds.includes(match.id))
        .sort(
          (left, right) =>
            (left.membership === "team" ? (priorTotals[left.id]?.balanceMs ?? 0) : 0) -
              (right.membership === "team"
                ? (priorTotals[right.id]?.balanceMs ?? 0)
                : 0) || left.sortOrder - right.sortOrder,
        )
        .slice(0, match.playersOnField)
        .map((player) => player.id),
    [eligiblePlayers, match.id, match.playersOnField, priorTotals],
  );
  const initialAvailable = eligiblePlayers
    .filter((player) => !player.unavailableMatchIds.includes(match.id))
    .map((player) => player.id);
  const initialStarters =
    match.selectedStarterIds?.filter((id) => initialAvailable.includes(id)).length ===
    match.playersOnField
      ? match.selectedStarterIds
      : recommendedIds;
  const [availableIds, setAvailableIds] = useState<string[]>(initialAvailable);
  const [starterIds, setStarterIds] = useState<string[]>(initialStarters ?? []);
  const [starting, setStarting] = useState(false);
  const startInFlight = useRef(false);
  const [availabilitySaving, setAvailabilitySaving] = useState(false);
  const availabilityInFlight = useRef(false);
  const [addingGuest, setAddingGuest] = useState(false);
  const [error, setError] = useState<string>();
  const [audioMessage, setAudioMessage] = useState<string>();
  const fixedSubstitutionRhythmMs = effectiveSubstitutionInterval(
    match,
    bundle.tournament,
  );

  const balances = Object.fromEntries(
    eligiblePlayers.map((player) => [
      playerId(player.id),
      player.membership === "team" && bundle.tournament.fairnessScope === "tournament"
        ? (priorTotals[player.id]?.balanceMs ?? 0)
        : 0,
    ]),
  ) as Record<PlayerId, number>;
  const zeros = Object.fromEntries(
    eligiblePlayers.map((player) => [playerId(player.id), 0]),
  ) as Record<PlayerId, number>;
  const normalMatchTargetMs =
    availableIds.length > 0
      ? (match.plannedDurationMs * match.playersOnField) / availableIds.length
      : 0;
  const maximumFutureActualMsByPlayer = Object.fromEntries(
    eligiblePlayers
      .filter(
        (player) =>
          availableIds.includes(player.id) &&
          player.membership === "team" &&
          player.participationPauses.some((pause) => pause.compensationActive) &&
          (priorTotals[player.id]?.balanceMs ?? 0) < -DEFAULT_COMPENSATION_TOLERANCE_MS,
      )
      .map((player) => [
        playerId(player.id),
        Math.min(
          match.plannedDurationMs,
          Math.round(normalMatchTargetMs + DEFAULT_RETURN_COMPENSATION_CAP_MS),
        ),
      ]),
  );
  const goalkeeperContext = {
    goalkeeperPreferenceByPlayer: goalkeeperPreferences(players),
    exposure: priorExposure,
  };
  const startersComplete = starterIds.length === match.playersOnField;
  const roleAssignments: RoleAssignment[] = formation
    ? normalizeRoleAssignments(
        formation,
        starterIds.map(playerId),
        manualRoles ??
          (startersComplete
            ? suggestRoleAssignments(
                formation,
                starterIds.map(playerId),
                goalkeeperContext,
              )
            : []),
      )
    : [];
  const keeperSlot = formation ? goalkeeperSlot(formation) : undefined;
  const keeperId = keeperSlot
    ? roleAssignments.find((assignment) => assignment.roleSlotId === keeperSlot.id)
        ?.playerId
    : undefined;
  const keeperPlayer = players.find((player) => player.id === keeperId);
  const lockedOnFieldPlayerIds =
    keeperPolicy === "fixed" && keeperId !== undefined ? [keeperId] : [];
  const clearPicks = () => {
    setPickedRoleSlotId(undefined);
    setPickedBenchId(undefined);
  };
  const placeOnSlot = (benchPlayerId: string, roleSlotId: string) => {
    if (!formation || startInFlight.current) return;
    const occupant = roleAssignments.find(
      (assignment) => assignment.roleSlotId === roleSlotId,
    );
    setStarterIds([
      ...starterIds.filter((id) => id !== occupant?.playerId),
      benchPlayerId,
    ]);
    setManualRoles([
      ...roleAssignments.filter((assignment) => assignment.roleSlotId !== roleSlotId),
      { roleSlotId, playerId: playerId(benchPlayerId) },
    ]);
    clearPicks();
  };
  const pressRoleSlot = (roleSlotId: string) => {
    if (!formation || startInFlight.current) return;
    if (pickedBenchId) {
      placeOnSlot(pickedBenchId, roleSlotId);
      return;
    }
    if (!pickedRoleSlotId || pickedRoleSlotId === roleSlotId) {
      setPickedRoleSlotId(pickedRoleSlotId === roleSlotId ? undefined : roleSlotId);
      return;
    }
    const from = pickedRoleSlotId;
    setManualRoles(
      roleAssignments.map((assignment) =>
        assignment.roleSlotId === from
          ? { ...assignment, roleSlotId }
          : assignment.roleSlotId === roleSlotId
            ? { ...assignment, roleSlotId: from }
            : assignment,
      ),
    );
    clearPicks();
  };
  const pressBenchPlayer = (benchPlayerId: string) => {
    if (!formation || startInFlight.current) return;
    if (pickedRoleSlotId) {
      placeOnSlot(benchPlayerId, pickedRoleSlotId);
      return;
    }
    const emptySlot = formation.slots.find(
      (roleSlot) =>
        !roleAssignments.some((assignment) => assignment.roleSlotId === roleSlot.id),
    );
    if (emptySlot) {
      placeOnSlot(benchPlayerId, emptySlot.id);
      return;
    }
    setPickedBenchId(pickedBenchId === benchPlayerId ? undefined : benchPlayerId);
  };
  const benchFromSlot = (roleSlotId: string) => {
    const occupant = roleAssignments.find(
      (assignment) => assignment.roleSlotId === roleSlotId,
    );
    if (!occupant) return;
    setStarterIds(starterIds.filter((id) => id !== occupant.playerId));
    setManualRoles(roleAssignments.filter((assignment) => assignment !== occupant));
    clearPicks();
  };
  const suggestLineup = () => {
    setStarterIds(
      recommendedIds
        .filter((id) => availableIds.includes(id))
        .slice(0, match.playersOnField),
    );
    setManualRoles(undefined);
    clearPicks();
  };
  const planningResult =
    starterIds.length === match.playersOnField &&
    availableIds.length >= match.playersOnField
      ? planMatch({
          nowElapsedMs: 0,
          plannedEndElapsedMs: match.plannedDurationMs,
          fieldSlots: match.playersOnField,
          lockedOnFieldPlayerIds,
          orderedAvailablePlayerIds: eligiblePlayers
            .filter((player) => availableIds.includes(player.id))
            .map((player) => playerId(player.id)),
          currentLineupIds: starterIds.map(playerId),
          balancesMsByPlayer: balances,
          maximumFutureActualMsByPlayer,
          matchOnlyPlayerIds: eligiblePlayers
            .filter(
              (player) =>
                player.membership === "guest" && availableIds.includes(player.id),
            )
            .map((player) => playerId(player.id)),
          currentMatchBalancesMsByPlayer: zeros,
          currentFieldStintMsByPlayer: zeros,
          currentBenchStintMsByPlayer: zeros,
          minimumPreferredStintMs: match.minimumStintMs,
          minimumPreferredBenchRestMs: DEFAULT_MINIMUM_BENCH_REST_MS,
          compensationToleranceMs: DEFAULT_COMPENSATION_TOLERANCE_MS,
          ...(fixedSubstitutionRhythmMs ? { fixedSubstitutionRhythmMs } : {}),
          preferredChangeIntervalMs: Math.floor(
            match.plannedDurationMs / availableIds.length,
          ),
        })
      : undefined;
  const recommendation = planningResult?.recommendation;
  const plannedRoles =
    formation && planningResult
      ? roleSteps(formation, roleAssignments, planningResult.preview, goalkeeperContext)
      : [];

  const toggleAvailability = async (id: string) => {
    if (availabilityInFlight.current || startInFlight.current) return;
    const player = players.find((candidate) => candidate.id === id);
    if (!player) return;
    availabilityInFlight.current = true;
    setAvailabilitySaving(true);
    setError(undefined);
    try {
      if (availableIds.includes(id)) {
        const explicitUnavailableMatchIds = [
          ...new Set([...player.explicitUnavailableMatchIds, match.id]),
        ];
        const updated = {
          ...player,
          explicitUnavailableMatchIds,
          unavailableMatchIds: [
            ...new Set([
              ...explicitUnavailableMatchIds,
              ...player.participationPauses.flatMap((pause) => pause.matchIds),
            ]),
          ],
        };
        await repository.updatePlayer(updated);
        setPlayers((current) =>
          current.map((candidate) => (candidate.id === id ? updated : candidate)),
        );
        setAvailableIds((current) => current.filter((playerId) => playerId !== id));
        setStarterIds((current) => current.filter((playerId) => playerId !== id));
      } else {
        const explicitUnavailableMatchIds = player.explicitUnavailableMatchIds.filter(
          (matchId) => matchId !== match.id,
        );
        const participationPauses = player.participationPauses.map((pause) => {
          if (!pause.matchIds.includes(match.id)) return pause;
          const matchIds = pause.matchIds.filter(
            (pausedMatchId) => pausedMatchId !== match.id,
          );
          return {
            ...pause,
            matchIds,
            resumedMatchIds: [...new Set([...pause.resumedMatchIds, match.id])],
            availabilityActive: pause.scope !== "current" || matchIds.length > 0,
          };
        });
        const updated = {
          ...player,
          explicitUnavailableMatchIds,
          participationPauses,
          unavailableMatchIds: [
            ...new Set([
              ...explicitUnavailableMatchIds,
              ...participationPauses.flatMap((pause) => pause.matchIds),
            ]),
          ],
        };
        await repository.updatePlayer(updated);
        setPlayers((current) =>
          current.map((candidate) => (candidate.id === id ? updated : candidate)),
        );
        setAvailableIds((current) => [...current, id]);
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Tilgjengeligheten kunne ikke lagres.",
      );
    } finally {
      availabilityInFlight.current = false;
      setAvailabilitySaving(false);
    }
  };

  const toggleGuestParticipation = (id: string) => {
    if (startInFlight.current) return;
    if (participantIds.includes(id)) {
      setParticipantIds((current) => current.filter((playerId) => playerId !== id));
      setAvailableIds((current) => current.filter((playerId) => playerId !== id));
      setStarterIds((current) => current.filter((playerId) => playerId !== id));
    } else {
      setParticipantIds((current) => [...current, id]);
      const player = players.find((candidate) => candidate.id === id);
      if (!player?.unavailableMatchIds.includes(match.id)) {
        setAvailableIds((current) => [...current, id]);
      }
    }
  };

  const addGuest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (startInFlight.current) return;
    const form = event.currentTarget;
    const name = formString(new FormData(form), "guestName");
    setAddingGuest(true);
    setError(undefined);
    try {
      const guest = await repository.addPlayer(bundle.tournament.id, name, "guest");
      setPlayers((current) => [...current, guest]);
      setParticipantIds((current) => [...current, guest.id]);
      setAvailableIds((current) => [...current, guest.id]);
      form.reset();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Gjesten kunne ikke legges til.",
      );
    } finally {
      setAddingGuest(false);
    }
  };

  const toggleStarter = (id: string) => {
    if (startInFlight.current) return;
    if (!availableIds.includes(id)) return;
    setStarterIds((current) =>
      current.includes(id)
        ? current.filter((playerId) => playerId !== id)
        : current.length < match.playersOnField
          ? [...current, id]
          : current,
    );
  };

  const testAudio = async () => {
    try {
      const played = await audio.play("change");
      setAudioMessage(played ? "Lyd klar" : "Lyd er ikke tilgjengelig");
    } catch {
      setAudioMessage("Trykk igjen for å aktivere lyd");
    }
  };

  const startMatch = async () => {
    if (availabilityInFlight.current) {
      setError("Vent til tilgjengeligheten er lagret før kampen starter.");
      return;
    }
    if (startInFlight.current) return;
    if (starterIds.length !== match.playersOnField) {
      setError(`Velg nøyaktig ${match.playersOnField} spillere på banen.`);
      return;
    }
    if (availableIds.length < match.playersOnField) {
      setError("Det er færre tilgjengelige spillere enn plasser på banen.");
      return;
    }
    startInFlight.current = true;
    setStarting(true);
    setError(undefined);

    const enhancementRequests = Promise.allSettled([
      audio.initialize(),
      wakeLock.request(),
    ]);
    const now = browserClockSource.wallNowMs();
    const event: MatchEventRecord = {
      id: crypto.randomUUID(),
      matchId: match.id,
      sequence: 0,
      type: "MATCH_STARTED",
      elapsedMs: 0,
      recordedAtWallMs: now,
      source: "user",
      schemaVersion: 1,
      payload: {
        starterLineupIds: starterIds,
        availablePlayerIds: availableIds,
        plannedDurationMs: match.plannedDurationMs,
        playersOnField: match.playersOnField,
        ...(formation
          ? {
              formationId: formation.id,
              starterRoleAssignments: toRoleAssignmentRecords(roleAssignments),
            }
          : {}),
      },
    };
    const journal: ActiveMatchJournalRecord = {
      matchId: match.id,
      clockStatus: "running",
      elapsedAtSnapshotMs: 0,
      snapshotWallMs: now,
      lastResumeWallMs: now,
      plannedDurationMs: match.plannedDurationMs,
      currentLineupIds: starterIds,
      lastEventSequence: 0,
      savedAtWallMs: now,
    };
    const resolvedRecoveryPlayers = players
      .filter(
        (player) =>
          player.membership === "team" &&
          player.participationPauses.some((pause) => pause.compensationActive) &&
          (priorTotals[player.id]?.balanceMs ?? 0) >=
            -DEFAULT_COMPENSATION_TOLERANCE_MS,
      )
      .map((player) => ({
        ...player,
        participationPauses: player.participationPauses.map((pause) => ({
          ...pause,
          compensationActive: false,
        })),
      }));
    try {
      await repository.commitMatchAction(
        event,
        {
          ...match,
          eligiblePlayerIds: participantIds,
          selectedStarterIds: starterIds,
          ...(formation
            ? { selectedRoleAssignments: toRoleAssignmentRecords(roleAssignments) }
            : {}),
          status: "running",
        },
        journal,
        resolvedRecoveryPlayers,
      );
      await enhancementRequests;
      navigate({ name: "live", matchId: match.id }, true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kampen kunne ikke startes.");
      setStarting(false);
      startInFlight.current = false;
      await wakeLock.release();
    }
  };

  const firstSwap = recommendation?.swaps[0];
  const activeAvailablePlayers = eligiblePlayers.filter((player) =>
    availableIds.includes(player.id),
  );

  return (
    <main className="page">
      <PageHeader
        eyebrow={`${formatMatchTime(match.scheduledStartLocal)}${match.pitch ? ` · Bane ${match.pitch}` : ""}`}
        title={`mot ${match.opponent || "motstander"}`}
        subtitle={`${formatDuration(match.plannedDurationMs)} · ${formation ? formation.name : `${match.playersOnField} spillere på banen`} · ${substitutionRhythmLabel(match, bundle.tournament)}`}
        onBack={() =>
          navigate({ name: "tournament", tournamentId: bundle.tournament.id })
        }
        action={<Button onClick={() => void testAudio()}>Test lyd</Button>}
      />
      {audioMessage && <div className="notice">{audioMessage}</div>}

      <Card>
        <div className="split-heading">
          <h2>Gjestespillere</h2>
          <StatusPill>
            {guestPlayers.filter((player) => participantIds.includes(player.id)).length}{" "}
            med i kampen
          </StatusPill>
        </div>
        <p className="muted">
          Gjester deler spilletiden i denne kampen, men påvirker ikke lagets avvik i
          senere kamper.
        </p>
        {guestPlayers.length > 0 && (
          <div className="guest-picker">
            {guestPlayers.map((player) => (
              <button
                key={player.id}
                aria-pressed={participantIds.includes(player.id)}
                disabled={starting}
                onClick={() => toggleGuestParticipation(player.id)}
              >
                <strong>{player.name}</strong>
                <span>
                  {participantIds.includes(player.id)
                    ? player.unavailableMatchIds.includes(match.id)
                      ? "Med · deltakelsespause"
                      : "Med i kampen"
                    : "Ikke med"}
                </span>
              </button>
            ))}
          </div>
        )}
        <form className="add-row" onSubmit={(event) => void addGuest(event)}>
          <label className="sr-only" htmlFor="quick-guest-name">
            Navn på gjestespiller
          </label>
          <input
            id="quick-guest-name"
            name="guestName"
            required
            disabled={addingGuest || starting}
            placeholder="Navn på ny gjest"
            autoComplete="off"
          />
          <Button type="submit" disabled={addingGuest || starting}>
            {addingGuest ? "Legger til …" : "Legg til gjest"}
          </Button>
        </form>
      </Card>

      {planningResult && planningResult.preview.length > 0 && (
        <Card>
          <div className="split-heading">
            <h2>Fast bytteplan</h2>
            <StatusPill>{planningResult.preview.length} bytter</StatusPill>
          </div>
          <p className="muted">
            Planen ligger fast på kampklokka. Bare fremtidige navn endres hvis
            virkeligheten krever det.
          </p>
          <ol className="substitution-plan">
            {planningResult.preview.map((step, stepIndex) => (
              <li key={`${step.dueAtElapsedMs}-${step.swaps[0]?.incomingPlayerId}`}>
                <time>{formatDuration(step.dueAtElapsedMs)}</time>
                <span>
                  {step.swaps
                    .map((swap) => {
                      const role =
                        formation && plannedRoles[stepIndex]
                          ? roleLabelFor(
                              formation,
                              plannedRoles[stepIndex].assignmentsAfter,
                              swap.incomingPlayerId,
                            )
                          : undefined;
                      return `${playerName(players, swap.incomingPlayerId)} inn${
                        role ? ` (${role.toLocaleLowerCase("nb-NO")})` : ""
                      } · ${playerName(players, swap.outgoingPlayerId)} ut`;
                    })
                    .join(" + ")}
                  {formation && plannedRoles[stepIndex]?.moves.length ? (
                    <small className="substitution-plan__move">
                      {describeMoves(formation, plannedRoles[stepIndex].moves, players)}
                    </small>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
          {recommendation?.diagnostics.fixedRhythm && (
            <div className="interval-allocation">
              <h3>Planlagte intervaller</h3>
              <div>
                {eligiblePlayers
                  .filter((player) => availableIds.includes(player.id))
                  .map((player) => {
                    const count =
                      recommendation.diagnostics.fixedRhythm
                        ?.plannedIntervalCountByPlayer[playerId(player.id)] ?? 0;
                    return (
                      <span key={player.id}>
                        <strong>{player.name}</strong> {count} ·{" "}
                        {formatDuration(count * (fixedSubstitutionRhythmMs ?? 0))}
                      </span>
                    );
                  })}
              </div>
              <p>Forskjell på ett intervall er forventet og roteres mellom kampene.</p>
            </div>
          )}
        </Card>
      )}

      <Card>
        <div className="split-heading">
          <h2>Tilgjengelighet</h2>
          <StatusPill
            tone={availableIds.length >= match.playersOnField ? "positive" : "danger"}
          >
            {availableIds.length} tilgjengelige
          </StatusPill>
        </div>
        <ul className="list selection-list">
          {eligiblePlayers.map((player) => (
            <li className="selection-row" key={player.id}>
              <button
                className="availability-toggle"
                aria-pressed={availableIds.includes(player.id)}
                disabled={availabilitySaving || starting}
                onClick={() => void toggleAvailability(player.id)}
              >
                <span aria-hidden="true">
                  {availableIds.includes(player.id) ? "✓" : "–"}
                </span>
                <span>
                  <strong>{player.name}</strong>
                  <small>
                    {player.membership === "guest"
                      ? "Gjest · mål gjelder bare denne kampen"
                      : `Totalt ${formatDuration(
                          priorTotals[player.id]?.actualMs ?? 0,
                        )} · avvik ${formatSignedDuration(
                          priorTotals[player.id]?.balanceMs ?? 0,
                        )}`}
                  </small>
                </span>
                <span>
                  {availableIds.includes(player.id)
                    ? "Tilgjengelig"
                    : player.unavailableMatchIds.includes(match.id)
                      ? "Deltakelsespause"
                      : "Ikke tilgjengelig"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      {formation ? (
        <Card>
          <div className="split-heading">
            <h2>Startoppstilling</h2>
            <StatusPill tone={startersComplete ? "positive" : "warning"}>
              {starterIds.length} av {match.playersOnField} valgt
            </StatusPill>
          </div>
          <p className="muted pitch-hint" aria-live="polite">
            {pickedBenchId
              ? `Trykk plassen ${playerName(players, pickedBenchId)} skal ta.`
              : pickedRoleSlotId
                ? "Trykk en annen plass for å bytte, eller et barn på benken."
                : `${formation.name}. Trykk en plass og så et barn eller en annen plass.${
                    keeperPolicy === "fixed" && keeperPlayer
                      ? ` ${keeperPlayer.name} står i mål hele kampen.`
                      : ""
                  }`}
          </p>
          <Pitch
            formation={formation}
            assignments={roleAssignments}
            players={players}
            selectedRoleSlotId={pickedRoleSlotId}
            onSlotPress={pressRoleSlot}
          />
          <div className="split-heading">
            <h3>Benk</h3>
            {pickedRoleSlotId &&
              roleAssignments.some(
                (assignment) => assignment.roleSlotId === pickedRoleSlotId,
              ) && (
                <Button variant="quiet" onClick={() => benchFromSlot(pickedRoleSlotId)}>
                  Sett på benken
                </Button>
              )}
          </div>
          <div className="pitch-bench" role="group" aria-label="Benk">
            {activeAvailablePlayers
              .filter((player) => !starterIds.includes(player.id))
              .map((player) => (
                <button
                  key={player.id}
                  type="button"
                  className="pitch-bench__player"
                  aria-pressed={pickedBenchId === player.id}
                  aria-label={`Benk: ${player.name}`}
                  disabled={starting}
                  onClick={() => pressBenchPlayer(player.id)}
                >
                  {player.name}
                </button>
              ))}
            {activeAvailablePlayers.length <= starterIds.length && (
              <p className="muted">Ingen på benken.</p>
            )}
          </div>
          {keeperPlayer && keeperPlayer.goalkeeperPreference === "unavailable" && (
            <div className="notice" role="alert">
              {keeperPlayer.name} er markert som «ikke i mål». Velg en annen keeper.
            </div>
          )}
          <Button full disabled={starting} onClick={suggestLineup}>
            Foreslå oppstilling
          </Button>
        </Card>
      ) : (
        <Card>
          <div className="split-heading">
            <h2>Startoppstilling</h2>
            <StatusPill
              tone={starterIds.length === match.playersOnField ? "positive" : "warning"}
            >
              {starterIds.length} av {match.playersOnField} valgt
            </StatusPill>
          </div>
          <div className="starter-grid">
            {activeAvailablePlayers.map((player) => (
              <button
                key={player.id}
                className="starter-card"
                aria-pressed={starterIds.includes(player.id)}
                disabled={starting}
                onClick={() => toggleStarter(player.id)}
              >
                <span aria-hidden="true">
                  {starterIds.includes(player.id) ? "●" : "○"}
                </span>
                <strong>{player.name}</strong>
                <small>{starterIds.includes(player.id) ? "På banen" : "Benk"}</small>
              </button>
            ))}
          </div>
          <Button full disabled={starting} onClick={suggestLineup}>
            Bruk anbefalt startoppstilling
          </Button>
        </Card>
      )}
      <Card>
        <p className="eyebrow">Første planlagte bytte</p>
        {firstSwap && recommendation ? (
          <div className="preview-swap">
            <strong>{formatDuration(recommendation.dueAtElapsedMs)}</strong>
            <span>
              {playerName(players, firstSwap.incomingPlayerId)} inn ·{" "}
              {playerName(players, firstSwap.outgoingPlayerId)} ut
            </span>
          </div>
        ) : (
          <p className="muted">
            {activeAvailablePlayers.length === match.playersOnField
              ? "Ingen bytter er nødvendige."
              : "Velg en gyldig startoppstilling for å se planen."}
          </p>
        )}
      </Card>

      {availableIds.length < match.playersOnField && (
        <div className="notice" role="alert">
          Minst {match.playersOnField} spillere må være tilgjengelige for å fylle banen.
        </div>
      )}
      {error && (
        <div className="notice" role="alert">
          {error}
        </div>
      )}
      <Button
        className="start-match-button"
        variant="primary"
        full
        disabled={
          starting ||
          availabilitySaving ||
          starterIds.length !== match.playersOnField ||
          availableIds.length < match.playersOnField
        }
        onClick={() => void startMatch()}
      >
        {starting ? "STARTER …" : "START KAMP"}
      </Button>
    </main>
  );
}
