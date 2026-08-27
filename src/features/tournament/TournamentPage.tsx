import { navigate } from "../../app/router";
import { useServices } from "../../app/services";
import {
  formatDuration,
  formatMatchTime,
  formatNorwegianDate,
  formatSignedDuration,
} from "../../components/format";
import { Button, Card, EmptyState, PageHeader, StatusPill } from "../../components/ui";
import { calculateTournamentTotals } from "../shared/data";
import { useAsyncData } from "../shared/hooks";

const statusText = {
  scheduled: "Planlagt",
  ready: "Klar",
  running: "Pågår",
  paused: "Pause",
  completed: "Ferdig",
  abandoned: "Avbrutt",
} as const;

export function TournamentPage({ tournamentId }: { tournamentId: string }) {
  const { repository } = useServices();
  const state = useAsyncData(async () => {
    const bundle = await repository.getTournamentBundle(tournamentId);
    if (!bundle) throw new Error("Spilldagen finnes ikke.");
    const totals = await calculateTournamentTotals(repository, bundle);
    return { bundle, totals };
  }, [repository, tournamentId]);

  if (state.status === "loading") {
    return <main className="centered-page">Laster spilldagen …</main>;
  }
  if (state.status === "error") {
    return (
      <main className="centered-page">
        <Card className="card--danger">
          <h1>Kunne ikke åpne spilldagen</h1>
          <p>{state.error.message}</p>
          <Button onClick={() => navigate({ name: "home" })}>Til forsiden</Button>
        </Card>
      </main>
    );
  }

  const { bundle, totals } = state.data;
  const nextMatch =
    bundle.matches.find((match) => match.status === "running") ??
    bundle.matches.find((match) => match.status === "paused") ??
    bundle.matches.find(
      (match) => match.status === "ready" || match.status === "scheduled",
    );
  const played = bundle.matches.filter((match) => match.status === "completed").length;

  return (
    <main className="page">
      <PageHeader
        eyebrow={bundle.tournament.name}
        title={bundle.tournament.teamName}
        subtitle={formatNorwegianDate(bundle.tournament.date)}
        onBack={() => navigate({ name: "home" })}
        action={
          <Button
            variant="quiet"
            onClick={() =>
              navigate({ name: "settings", tournamentId: bundle.tournament.id })
            }
          >
            Innstillinger
          </Button>
        }
      />

      {nextMatch ? (
        <Card className="card--accent next-match">
          <div className="split-heading">
            <p className="eyebrow">
              {nextMatch.status === "running" || nextMatch.status === "paused"
                ? "Aktiv kamp"
                : "Neste kamp"}
            </p>
            <StatusPill>{statusText[nextMatch.status]}</StatusPill>
          </div>
          <h2>mot {nextMatch.opponent || "motstander ikke satt"}</h2>
          <p className="next-match__detail">
            {formatMatchTime(nextMatch.scheduledStartLocal)}
            {nextMatch.pitch ? ` · Bane ${nextMatch.pitch}` : ""}
            {" · "}
            {formatDuration(nextMatch.plannedDurationMs)}
          </p>
          <Button
            full
            onClick={() =>
              navigate(
                nextMatch.status === "running" || nextMatch.status === "paused"
                  ? { name: "live", matchId: nextMatch.id }
                  : { name: "pre-match", matchId: nextMatch.id },
              )
            }
          >
            {nextMatch.status === "running" || nextMatch.status === "paused"
              ? "FORTSETT KAMP"
              : "GJØR KLAR KAMP"}
          </Button>
        </Card>
      ) : (
        <EmptyState
          title="Alle kampene er ferdige"
          action={
            <Button
              variant="primary"
              onClick={() =>
                navigate({
                  name: "tournament-summary",
                  tournamentId: bundle.tournament.id,
                })
              }
            >
              Se oppsummering
            </Button>
          }
        >
          <p>Spilletid og rettferdig mål er klare for gjennomgang.</p>
        </EmptyState>
      )}

      <div className="nav-grid">
        <button
          onClick={() =>
            navigate({ name: "roster", tournamentId: bundle.tournament.id })
          }
        >
          <span className="nav-grid__icon" aria-hidden="true">
            ◎
          </span>
          <strong>Spillere</strong>
          <small>
            {
              bundle.players.filter(
                (player) => player.active && player.membership === "team",
              ).length
            }{" "}
            lagspillere
            {bundle.players.some(
              (player) => player.active && player.membership === "guest",
            )
              ? ` · ${
                  bundle.players.filter(
                    (player) => player.active && player.membership === "guest",
                  ).length
                } gjester`
              : ""}
          </small>
        </button>
        <button
          onClick={() =>
            navigate({ name: "matches", tournamentId: bundle.tournament.id })
          }
        >
          <span className="nav-grid__icon" aria-hidden="true">
            ◫
          </span>
          <strong>Kamper</strong>
          <small>
            {played} av {bundle.matches.length} ferdige
          </small>
        </button>
        <button
          onClick={() =>
            navigate({
              name: "tournament-summary",
              tournamentId: bundle.tournament.id,
            })
          }
        >
          <span className="nav-grid__icon" aria-hidden="true">
            ≋
          </span>
          <strong>Oppsummering</strong>
          <small>Hele spilldagen</small>
        </button>
      </div>

      <Card>
        <div className="split-heading">
          <h2>Spilletid så langt</h2>
          <span className="muted">Faktisk · avvik</span>
        </div>
        {bundle.players.filter(
          (player) => player.active && player.membership === "team",
        ).length === 0 ? (
          <p className="muted">Legg til spillere før første kamp.</p>
        ) : (
          <ul className="list">
            {bundle.players
              .filter((player) => player.active && player.membership === "team")
              .map((player) => (
                <li className="list-row" key={player.id}>
                  <div className="list-row__main">
                    <p className="list-row__title">{player.name}</p>
                    <p className="list-row__meta">
                      Mål for spilletid{" "}
                      {formatDuration(totals[player.id]?.idealMs ?? 0)}
                    </p>
                  </div>
                  <div className="balance-value">
                    <strong>{formatDuration(totals[player.id]?.actualMs ?? 0)}</strong>
                    <span>
                      {formatSignedDuration(totals[player.id]?.balanceMs ?? 0)}
                    </span>
                  </div>
                </li>
              ))}
          </ul>
        )}
        <p className="notice">
          Avvik viser faktisk spilletid minus det tilgjengelighetsjusterte målet. Små
          forskjeller er normale og tas med til neste kamp.
        </p>
      </Card>
    </main>
  );
}
