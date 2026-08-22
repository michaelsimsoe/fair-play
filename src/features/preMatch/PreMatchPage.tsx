import { useMemo, useState } from "react";
import { navigate } from "../../app/router";
import { useServices } from "../../app/services";
import {
  formatDuration,
  formatMatchTime,
  formatSignedDuration,
} from "../../components/format";
import { Button, Card, PageHeader, StatusPill } from "../../components/ui";
import { planRecommendation, playerId, type PlayerId } from "../../domain";
import type { ActiveMatchJournalRecord, MatchEventRecord } from "../../storage/schema";
import { calculateTournamentTotals, loadMatchData, playerName } from "../shared/data";
import { useAsyncData } from "../shared/hooks";

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
  const eligiblePlayers = bundle.players.filter(
    (player) => player.active && match.eligiblePlayerIds.includes(player.id),
  );
  const recommendedIds = useMemo(
    () =>
      [...eligiblePlayers]
        .sort(
          (left, right) =>
            (priorTotals[left.id]?.balanceMs ?? 0) -
              (priorTotals[right.id]?.balanceMs ?? 0) ||
            left.sortOrder - right.sortOrder,
        )
        .slice(0, match.playersOnField)
        .map((player) => player.id),
    [eligiblePlayers, match.playersOnField, priorTotals],
  );
  const initialAvailable = eligiblePlayers.map((player) => player.id);
  const initialStarters =
    match.selectedStarterIds?.filter((id) => initialAvailable.includes(id)).length ===
    match.playersOnField
      ? match.selectedStarterIds
      : recommendedIds;
  const [availableIds, setAvailableIds] = useState<string[]>(initialAvailable);
  const [starterIds, setStarterIds] = useState<string[]>(initialStarters ?? []);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string>();
  const [audioMessage, setAudioMessage] = useState<string>();

  const balances = Object.fromEntries(
    eligiblePlayers.map((player) => [
      playerId(player.id),
      bundle.tournament.fairnessScope === "tournament"
        ? (priorTotals[player.id]?.balanceMs ?? 0)
        : 0,
    ]),
  ) as Record<PlayerId, number>;
  const zeros = Object.fromEntries(
    eligiblePlayers.map((player) => [playerId(player.id), 0]),
  ) as Record<PlayerId, number>;
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
          currentFieldStintMsByPlayer: zeros,
          currentBenchStintMsByPlayer: zeros,
          minimumPreferredStintMs: match.minimumStintMs,
          preferredChangeIntervalMs: Math.floor(
            match.plannedDurationMs / availableIds.length,
          ),
        })
      : undefined;

  const toggleAvailability = (id: string) => {
    if (availableIds.includes(id)) {
      setAvailableIds((current) => current.filter((playerId) => playerId !== id));
      setStarterIds((current) => current.filter((playerId) => playerId !== id));
    } else {
      setAvailableIds((current) => [...current, id]);
    }
  };

  const toggleStarter = (id: string) => {
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
    if (starterIds.length !== match.playersOnField) {
      setError(`Velg nøyaktig ${match.playersOnField} spillere på banen.`);
      return;
    }
    if (availableIds.length < match.playersOnField) {
      setError("Det er færre tilgjengelige spillere enn plasser på banen.");
      return;
    }
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
    try {
      await repository.commitMatchAction(
        event,
        {
          ...match,
          selectedStarterIds: starterIds,
          status: "running",
        },
        journal,
      );
      await enhancementRequests;
      navigate({ name: "live", matchId: match.id }, true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kampen kunne ikke startes.");
      setStarting(false);
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
                onClick={() => toggleAvailability(player.id)}
              >
                <span aria-hidden="true">
                  {availableIds.includes(player.id) ? "✓" : "–"}
                </span>
                <span>
                  <strong>{player.name}</strong>
                  <small>
                    Totalt {formatDuration(priorTotals[player.id]?.actualMs ?? 0)} ·
                    avvik {formatSignedDuration(priorTotals[player.id]?.balanceMs ?? 0)}
                  </small>
                </span>
                <span>
                  {availableIds.includes(player.id)
                    ? "Tilgjengelig"
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
              {playerName(bundle.players, firstSwap.incomingPlayerId)} inn ·{" "}
              {playerName(bundle.players, firstSwap.outgoingPlayerId)} ut
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
