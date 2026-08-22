import { useState } from "react";
import { navigate } from "../../app/router";
import { useServices } from "../../app/services";
import {
  formatDuration,
  formatMatchTime,
  formatSignedDuration,
} from "../../components/format";
import { Button, Card, PageHeader } from "../../components/ui";
import { playerId } from "../../domain";
import { shareOrDownloadJson } from "../../platform/fileShare";
import { exportBackup } from "../../storage/backup";
import type { MatchEventRecord } from "../../storage/schema";
import {
  calculateTournamentTotals,
  loadMatchData,
  playerName,
  projectStoredMatch,
} from "../shared/data";
import { useAsyncData } from "../shared/hooks";

export function MatchSummaryPage({ matchId }: { matchId: string }) {
  const { repository } = useServices();
  const state = useAsyncData(async () => {
    const data = await loadMatchData(repository, matchId);
    const priorTotals = await calculateTournamentTotals(
      repository,
      data.tournamentBundle,
      data.match.order,
    );
    return {
      ...data,
      priorTotals,
      projection: projectStoredMatch(data.match, data.events),
    };
  }, [repository, matchId]);
  const [message, setMessage] = useState<string>();
  const [working, setWorking] = useState(false);

  if (state.status === "loading") {
    return <main className="centered-page">Regner ut spilletid …</main>;
  }
  if (state.status === "error") throw state.error;

  const {
    match,
    events,
    tournamentBundle: bundle,
    projection,
    priorTotals,
  } = state.data;
  const nextMatch = bundle.matches.find(
    (candidate) =>
      candidate.order > match.order &&
      candidate.status !== "completed" &&
      candidate.status !== "abandoned",
  );

  const exportData = async () => {
    setWorking(true);
    try {
      const json = await exportBackup(repository.getDatabase());
      const result = await shareOrDownloadJson(
        json,
        `fairplay-${bundle.tournament.date}.json`,
      );
      setMessage(
        result === "cancelled" ? "Deling ble avbrutt." : "Sikkerhetskopien er klar.",
      );
    } catch (caught) {
      setMessage(
        caught instanceof Error ? caught.message : "Eksporten kunne ikke fullføres.",
      );
    } finally {
      setWorking(false);
    }
  };

  const undoLastSubstitution = async () => {
    const voidedIds = new Set(
      events
        .filter((event) => event.type === "EVENT_VOIDED")
        .map((event) =>
          event.type === "EVENT_VOIDED" ? event.payload.targetEventId : "",
        ),
    );
    const target = events
      .filter(
        (event) => event.type === "SUBSTITUTION_CONFIRMED" && !voidedIds.has(event.id),
      )
      .at(-1);
    if (!target) {
      setMessage("Det finnes ingen bytter å rette.");
      return;
    }
    setWorking(true);
    const correction: MatchEventRecord = {
      id: crypto.randomUUID(),
      matchId: match.id,
      sequence: (events.at(-1)?.sequence ?? -1) + 1,
      type: "EVENT_VOIDED",
      elapsedMs: projection.elapsedMs,
      recordedAtWallMs: Date.now(),
      source: "user",
      schemaVersion: 1,
      payload: {
        targetEventId: target.id,
        reason: "Korrigert fra kampoppsummeringen",
      },
    };
    try {
      await repository.commitMatchAction(correction, match, undefined);
      setMessage("Siste bytte er markert som angret i hendelsesloggen.");
      state.reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Korreksjonen feilet.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <main className="page">
      <PageHeader
        eyebrow="Kampen er ferdig"
        title={`mot ${match.opponent || "motstander"}`}
        subtitle={`${formatDuration(projection.elapsedMs)} · ${formatMatchTime(match.scheduledStartLocal)}${match.pitch ? ` · Bane ${match.pitch}` : ""}`}
        onBack={() =>
          navigate({ name: "tournament", tournamentId: bundle.tournament.id })
        }
      />

      {projection.eventIssues.length > 0 && (
        <Card className="card--warning">
          <h2>Historikken trenger gjennomgang</h2>
          <ul>
            {projection.eventIssues.map((issue, index) => (
              <li key={`${issue.code}-${index}`}>{issue.message}</li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <div className="split-heading">
          <h2>Spilletid</h2>
          <span className="muted">Faktisk · mål · avvik</span>
        </div>
        <ul className="list summary-players">
          {bundle.players
            .filter((player) => match.eligiblePlayerIds.includes(player.id))
            .map((player) => {
              const id = playerId(player.id);
              const actual = projection.actualMsByPlayer[id] ?? 0;
              const ideal = projection.idealMsByPlayer[id] ?? 0;
              const balance = actual - ideal;
              const stints = projection.playingStintsByPlayer[id] ?? [];
              const bench = projection.benchStintsByPlayer[id] ?? [];
              const longestBench = Math.max(
                0,
                ...bench.map(
                  (interval) => interval.endElapsedMs - interval.startElapsedMs,
                ),
              );
              return (
                <li className="summary-player" key={player.id}>
                  <div>
                    <strong>{player.name}</strong>
                    <small>
                      {stints.length} period{stints.length === 1 ? "e" : "er"} · lengste
                      benk {formatDuration(longestBench)}
                    </small>
                  </div>
                  <div className="summary-player__numbers">
                    <strong>{formatDuration(actual)}</strong>
                    <span>{formatDuration(ideal)}</span>
                    <span>{formatSignedDuration(balance)}</span>
                  </div>
                  <small className="summary-player__cumulative">
                    Hele spilldagen:{" "}
                    {formatDuration((priorTotals[player.id]?.actualMs ?? 0) + actual)} ·
                    avvik{" "}
                    {formatSignedDuration(
                      (priorTotals[player.id]?.balanceMs ?? 0) + balance,
                    )}
                  </small>
                </li>
              );
            })}
        </ul>
      </Card>

      <Card>
        <h2>Tidslinje</h2>
        <div className="timeline" aria-label="Lagoppstilling gjennom kampen">
          {projection.timelineSegments.map((segment, index) => {
            const width =
              projection.elapsedMs > 0
                ? ((segment.endElapsedMs - segment.startElapsedMs) /
                    projection.elapsedMs) *
                  100
                : 0;
            return (
              <div
                className="timeline__segment"
                style={{ width: `${width}%` }}
                key={`${segment.startElapsedMs}-${index}`}
                title={`${formatDuration(segment.startElapsedMs)}–${formatDuration(segment.endElapsedMs)}: ${segment.lineupIds.map((id) => playerName(bundle.players, id)).join(", ")}`}
              >
                <span>{formatDuration(segment.startElapsedMs)}</span>
              </div>
            );
          })}
        </div>
        <ol className="event-log">
          {events
            .filter(
              (event) =>
                event.type !== "MATCH_PAUSED" && event.type !== "MATCH_RESUMED",
            )
            .map((event) => (
              <li key={event.id}>
                <time>{formatDuration(event.elapsedMs)}</time>
                <span>{eventDescription(event, bundle.players)}</span>
              </li>
            ))}
        </ol>
      </Card>

      {message && (
        <div className="notice" role="status">
          {message}
        </div>
      )}
      <div className="button-row">
        {nextMatch && (
          <Button
            variant="primary"
            onClick={() => navigate({ name: "pre-match", matchId: nextMatch.id })}
          >
            Neste kamp
          </Button>
        )}
        <Button disabled={working} onClick={() => void undoLastSubstitution()}>
          Rett opp siste bytte
        </Button>
        <Button disabled={working} onClick={() => void exportData()}>
          Eksporter
        </Button>
      </div>
    </main>
  );
}

function eventDescription(
  event: MatchEventRecord,
  players: { id: string; name: string }[],
): string {
  switch (event.type) {
    case "MATCH_STARTED":
      return `Start: ${event.payload.starterLineupIds.map((id) => playerName(players, id)).join(", ")}`;
    case "SUBSTITUTION_CONFIRMED":
      return `${event.payload.incomingPlayerIds.map((id) => playerName(players, id)).join(", ")} inn · ${event.payload.outgoingPlayerIds.map((id) => playerName(players, id)).join(", ")} ut`;
    case "PLAYER_AVAILABILITY_CHANGED":
      return `${playerName(players, event.payload.playerId)} ${event.payload.available ? "tilgjengelig" : "ikke tilgjengelig"}`;
    case "LINEUP_SYNCHRONIZED":
      return "Lagoppstilling korrigert";
    case "MATCH_DURATION_CHANGED":
      return `Kamplengde endret til ${formatDuration(event.payload.newDurationMs)}`;
    case "MATCH_ENDED":
      return "Kampen avsluttet";
    case "MATCH_ABANDONED":
      return "Kampen avbrutt";
    case "EVENT_VOIDED":
      return "Tidligere hendelse angret";
    case "EVENT_REPLACED":
      return "Tidligere hendelse korrigert";
    case "MATCH_PAUSED":
      return "Pause";
    case "MATCH_RESUMED":
      return "Kampen fortsatte";
  }
}
