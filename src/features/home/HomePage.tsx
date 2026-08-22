import { useRef, useState, type ChangeEvent } from "react";
import { Button, Card, EmptyState, PageHeader, StatusPill } from "../../components/ui";
import { formatNorwegianDate } from "../../components/format";
import { navigate } from "../../app/router";
import { requestStoragePersistence } from "../../platform/storagePersistence";
import { importBackup, importSeed, ImportValidationError } from "../../storage/backup";
import { useServices } from "../../app/services";
import { useAsyncData } from "../shared/hooks";

type HomeData = Awaited<ReturnType<typeof loadHome>>;

async function loadHome(repository: ReturnType<typeof useServices>["repository"]) {
  const [tournaments, journals, settings] = await Promise.all([
    repository.listTournaments(),
    repository.getActiveJournals(),
    repository.getSettings(),
  ]);
  const activeMatches = await Promise.all(
    journals.map(async (journal) => {
      const match = await repository.getMatch(journal.matchId);
      if (!match) return undefined;
      const bundle = await repository.getTournamentBundle(match.tournamentId);
      if (!bundle) return undefined;
      return { journal, match, bundle };
    }),
  );
  return {
    tournaments,
    activeMatches: activeMatches.filter(
      (value): value is NonNullable<typeof value> => value !== undefined,
    ),
    settings,
  };
}

export function HomePage({ offlineReady }: { offlineReady: boolean }) {
  const { repository } = useServices();
  const state = useAsyncData<HomeData>(() => loadHome(repository), [repository]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [working, setWorking] = useState(false);

  const loadSample = async () => {
    setWorking(true);
    setError(undefined);
    try {
      const response = await fetch(
        `${import.meta.env.BASE_URL}seed/seed-krokelvdalen-2.json`,
      );
      if (!response.ok) throw new Error("Eksempelfilen kunne ikke lastes.");
      const tournamentId = await importSeed(
        await response.text(),
        repository.getDatabase(),
      );
      await requestStoragePersistence();
      navigate({ name: "tournament", tournamentId });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Importen feilet.");
    } finally {
      setWorking(false);
    }
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setWorking(true);
    setError(undefined);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { format?: unknown };
      let tournamentId: string;
      if (parsed.format === "fairplay-sideline-seed") {
        tournamentId = await importSeed(text, repository.getDatabase());
      } else {
        const imported = await importBackup(text, "copy", repository.getDatabase());
        const first = imported[0];
        if (!first) throw new Error("Filen inneholdt ingen spilldager.");
        tournamentId = first;
      }
      setMessage("Importen er lagret lokalt.");
      navigate({ name: "tournament", tournamentId });
    } catch (caught) {
      if (caught instanceof ImportValidationError) {
        setError(`${caught.message} ${caught.issues.slice(0, 3).join(" · ")}`);
      } else {
        setError(caught instanceof Error ? caught.message : "Importen feilet.");
      }
    } finally {
      setWorking(false);
    }
  };

  if (state.status === "loading") {
    return <main className="centered-page">Laster spilldager …</main>;
  }
  if (state.status === "error") {
    return (
      <main className="centered-page">
        <Card className="card--danger">
          <h1>Lokale data kunne ikke åpnes</h1>
          <p>{state.error.message}</p>
          <Button variant="primary" onClick={state.reload}>
            Prøv igjen
          </Button>
        </Card>
      </main>
    );
  }

  return (
    <main className="page">
      <PageHeader
        eyebrow="På sidelinjen"
        title="FairPlay"
        subtitle="Rettferdig spilletid. Det som faktisk skjedde."
        action={
          <StatusPill tone={offlineReady ? "positive" : "neutral"}>
            {offlineReady ? "Klar uten nett" : "Lagrer lokalt"}
          </StatusPill>
        }
      />

      {state.data.activeMatches.map(({ journal, match, bundle }) => (
        <Card className="card--accent" key={match.id}>
          <p className="eyebrow">En kamp var i gang</p>
          <h2>mot {match.opponent || "motstander ikke satt"}</h2>
          <p className="muted">
            {bundle.tournament.teamName} · Sist lagret{" "}
            {new Date(journal.savedAtWallMs).toLocaleTimeString("nb-NO")}
          </p>
          <Button full onClick={() => navigate({ name: "live", matchId: match.id })}>
            FORTSETT KAMP
          </Button>
        </Card>
      ))}

      <div className="button-row">
        <Button
          variant="primary"
          full
          onClick={() => navigate({ name: "new-tournament" })}
        >
          Ny spilldag
        </Button>
        <Button onClick={() => fileInput.current?.click()}>Importer</Button>
        <input
          ref={fileInput}
          className="sr-only"
          type="file"
          accept="application/json,.json"
          onChange={(event) => void importFile(event)}
        />
      </div>

      {error && (
        <div className="notice" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="notice" role="status">
          {message}
        </div>
      )}

      <section aria-labelledby="local-tournaments">
        <div className="split-heading">
          <h2 id="local-tournaments">Mine spilldager</h2>
          <span className="muted">{state.data.tournaments.length}</span>
        </div>
        {state.data.tournaments.length === 0 ? (
          <EmptyState
            title="Ingen spilldager ennå"
            action={
              <Button disabled={working} onClick={() => void loadSample()}>
                {working ? "Laster …" : "Last inn eksempel"}
              </Button>
            }
          >
            <p>Opprett en ny, eller prøv Krokelvdalen-eksempelet med fire kamper.</p>
          </EmptyState>
        ) : (
          <div className="list">
            {state.data.tournaments.map((tournament) => (
              <Card key={tournament.id}>
                <button
                  className="tournament-link"
                  onClick={() =>
                    navigate({ name: "tournament", tournamentId: tournament.id })
                  }
                >
                  <span>
                    <strong>{tournament.teamName}</strong>
                    <small>
                      {tournament.name} · {formatNorwegianDate(tournament.date)}
                    </small>
                  </span>
                  <span aria-hidden="true">→</span>
                </button>
              </Card>
            ))}
          </div>
        )}
      </section>

      {state.data.tournaments.length > 0 && (
        <Button disabled={working} onClick={() => void loadSample()}>
          {working ? "Laster eksempel …" : "Last inn eksempelspilldag"}
        </Button>
      )}

      <Card className="privacy-note">
        <h2>Privat på denne enheten</h2>
        <p className="muted">
          Navn, kamper og spilletid lagres bare i denne nettleseren. FairPlay har ingen
          konto, analyse eller skylagring. Ta en sikkerhetskopi etter spilldagen.
        </p>
        <Button variant="quiet" onClick={() => navigate({ name: "settings" })}>
          Data og innstillinger
        </Button>
      </Card>
    </main>
  );
}
