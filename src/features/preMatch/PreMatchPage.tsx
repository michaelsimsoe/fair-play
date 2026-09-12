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
  planRecommendation,
  playerId,
  type PlayerId,
} from "../../domain";
import type { ActiveMatchJournalRecord, MatchEventRecord } from "../../storage/schema";
import { calculateTournamentTotals, loadMatchData, playerName } from "../shared/data";
import { useAsyncData } from "../shared/hooks";
import { formString } from "../shared/forms";

export function PreMatchPage({ matchId }: { matchId: string }) {
  const { repository } = useServices();
  const state = useAsyncData(async () => {
    const data = await loadMatchData(repository, matchId);
    const priorTotals = await calculateTournamentTotals(
      repository,
      data.tournamentBundle,
      data.match.order,
    );
    return { ...data, priorTotals };
  }, [repository, matchId]);

  if (state.status === "loading") {
    return <main className="centered-page">Gjør klar kampen …</main>;
  }
  if (state.status === "error") throw state.error;
  return <PreMatchReady key={state.data.match.updatedAtWallMs} data={state.data} />;
}

type ReadyData = Awaited<ReturnType<typeof loadMatchData>> & {
  priorTotals: Awaited<ReturnType<typeof calculateTournamentTotals>>;
};

function PreMatchReady({ data }: { data: ReadyData }) {
  const { repository, audio, wakeLock } = useServices();
  const { match, tournamentBundle: bundle, priorTotals } = data;
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
  const recommendation =
    starterIds.length === match.playersOnField &&
    availableIds.length >= match.playersOnField
      ? planRecommendation({
          nowElapsedMs: 0,
          plannedEndElapsedMs: match.plannedDurationMs,
          fieldSlots: match.playersOnField,
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
          preferredChangeIntervalMs: Math.floor(
            match.plannedDurationMs / availableIds.length,
          ),
        })
      : undefined;

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
        const participationPauses = player.participationPauses.map((pause) =>
          pause.matchIds.includes(match.id)
            ? { ...pause, availabilityActive: false, matchIds: [] }
            : pause,
        );
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
    const now = Date.now();
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
        subtitle={`${formatDuration(match.plannedDurationMs)} · ${match.playersOnField} spillere på banen`}
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
        <Button
          full
          disabled={starting}
          onClick={() =>
            setStarterIds(
              recommendedIds
                .filter((id) => availableIds.includes(id))
                .slice(0, match.playersOnField),
            )
          }
        >
          Bruk anbefalt startoppstilling
        </Button>
      </Card>

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
