import { useState } from "react";
import { navigate } from "../../app/router";
import { useServices } from "../../app/services";
import {
  formatDuration,
  formatMatchTime,
  formatSignedDuration,
} from "../../components/format";
import { Button, Card, PageHeader, StatusPill } from "../../components/ui";
import { shareOrDownloadJson } from "../../platform/fileShare";
import { exportBackup } from "../../storage/backup";
import { calculateTournamentTotals } from "../shared/data";
import { useAsyncData } from "../shared/hooks";

export function TournamentSummaryPage({ tournamentId }: { tournamentId: string }) {
  const { repository } = useServices();
  const state = useAsyncData(async () => {
    const bundle = await repository.getTournamentBundle(tournamentId);
    if (!bundle) throw new Error("Spilldagen finnes ikke.");
    const totals = await calculateTournamentTotals(repository, bundle);
    return { bundle, totals };
  }, [repository, tournamentId]);
  const [message, setMessage] = useState<string>();

  if (state.status === "loading") {
    return <main className="centered-page">Lager oppsummering …</main>;
  }
  if (state.status === "error") throw state.error;
  const { bundle, totals } = state.data;
  const balances = bundle.players
    .filter((player) => player.active && player.membership === "team")
    .map((player) => totals[player.id]?.balanceMs ?? 0);
  const range = balances.length ? Math.max(...balances) - Math.min(...balances) : 0;
  const totalPlayerMs = Object.values(totals).reduce(
    (sum, total) => sum + total.actualMs,
    0,
  );
  const nextMatch = bundle.matches.find(
    (match) => match.status === "scheduled" || match.status === "ready",
  );

  const exportData = async () => {
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
      setMessage(caught instanceof Error ? caught.message : "Eksporten feilet.");
    }
  };

  return (
    <main className="page">
      <PageHeader
        eyebrow={bundle.tournament.name}
        title="Oppsummering"
        subtitle={bundle.tournament.teamName}
        onBack={() => navigate({ name: "tournament", tournamentId })}
        action={
          <Button variant="primary" onClick={() => void exportData()}>
            Eksporter
          </Button>
        }
      />

      <div className="metric-grid">
        <div className="metric">
          <span className="metric__label">Lagets spilletid</span>
          <span className="metric__value">{formatDuration(totalPlayerMs)}</span>
        </div>
        <div className="metric">
          <span className="metric__label">Største avviksspenn</span>
          <span className="metric__value">{formatDuration(range)}</span>
        </div>
      </div>

      <Card>
        <div className="split-heading">
          <h2>Lagspillere</h2>
          <span className="muted">Faktisk · mål · avvik</span>
        </div>
        <ul className="list summary-players">
          {bundle.players
            .filter((player) => player.active && player.membership === "team")
            .map((player) => (
              <li className="summary-player" key={player.id}>
                <strong>{player.name}</strong>
                <div className="summary-player__numbers">
                  <strong>{formatDuration(totals[player.id]?.actualMs ?? 0)}</strong>
                  <span>{formatDuration(totals[player.id]?.idealMs ?? 0)}</span>
                  <span>{formatSignedDuration(totals[player.id]?.balanceMs ?? 0)}</span>
                </div>
              </li>
            ))}
        </ul>
        <p className="notice">
          Avvik er ikke en rangering. Det viser bare hvor neste kamp kan kompensere for
          tilgjengelighetsjusterte forskjeller. Gjestespillere vises i
          kampoppsummeringen, men teller ikke her.
        </p>
      </Card>

      <Card>
        <h2>Kamper</h2>
        <ul className="list">
          {bundle.matches.map((match) => (
            <li className="list-row" key={match.id}>
              <button
                className="summary-match-link"
                onClick={() =>
                  navigate(
                    match.status === "completed"
                      ? { name: "match-summary", matchId: match.id }
                      : { name: "pre-match", matchId: match.id },
                  )
                }
              >
                <span>
                  <strong>mot {match.opponent || "motstander"}</strong>
                  <small>
                    {formatMatchTime(match.scheduledStartLocal)}
                    {match.pitch ? ` · Bane ${match.pitch}` : ""}
                  </small>
                </span>
                <StatusPill
                  tone={match.status === "completed" ? "positive" : "neutral"}
                >
                  {match.status === "completed" ? "Ferdig" : "Planlagt"}
                </StatusPill>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      {message && (
        <div className="notice" role="status">
          {message}
        </div>
      )}
      {nextMatch && (
        <Button
          variant="primary"
          full
          onClick={() => navigate({ name: "pre-match", matchId: nextMatch.id })}
        >
          Gjør klar neste kamp
        </Button>
      )}
    </main>
  );
}
