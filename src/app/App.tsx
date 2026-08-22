import { useEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "../components/ui";
import { CreateTournamentPage } from "../features/tournament/CreateTournamentPage";
import { HomePage } from "../features/home/HomePage";
import { LiveMatchPage } from "../features/liveMatch/LiveMatchPage";
import { MatchesPage } from "../features/matches/MatchesPage";
import { PreMatchPage } from "../features/preMatch/PreMatchPage";
import { RosterPage } from "../features/roster/RosterPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { MatchSummaryPage } from "../features/summary/MatchSummaryPage";
import { TournamentSummaryPage } from "../features/summary/TournamentSummaryPage";
import { TournamentPage } from "../features/tournament/TournamentPage";
import { useServices } from "./services";
import { consumeLiveExitPermission, parseRoute, type Route } from "./router";

export function App() {
  const { repository } = useServices();
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  const routeRef = useRef(route);
  const [ready, setReady] = useState(false);
  const [startupError, setStartupError] = useState<Error>();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.error("Service worker registration failed", error);
    },
  });

  useEffect(() => {
    void repository.initialize().then(
      async () => {
        const settings = await repository.getSettings();
        document.documentElement.dataset.theme =
          settings.fieldMode === "system" ? "" : settings.fieldMode;
        setReady(true);
      },
      (error: unknown) =>
        setStartupError(
          error instanceof Error ? error : new Error("Lokale data kunne ikke åpnes."),
        ),
    );
  }, [repository]);

  useEffect(() => {
    const handleHash = () => {
      const nextRoute = parseRoute(window.location.hash);
      const previous = routeRef.current;
      if (
        previous.name === "live" &&
        nextRoute.name !== "live" &&
        !consumeLiveExitPermission() &&
        !window.confirm(
          "Kampen pågår. Klokka fortsetter. Vil du gå bort fra kampvisningen?",
        )
      ) {
        window.location.hash = `/match/${previous.matchId}/live`;
        return;
      }
      routeRef.current = nextRoute;
      setRoute(nextRoute);
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  if (startupError) {
    return (
      <main className="centered-page">
        <div className="card card--danger">
          <h1>Lokale data kunne ikke åpnes</h1>
          <p>{startupError.message}</p>
          <Button variant="primary" onClick={() => window.location.reload()}>
            Prøv igjen
          </Button>
        </div>
      </main>
    );
  }
  if (!ready) return <main className="centered-page">Starter FairPlay …</main>;

  const page = (() => {
    switch (route.name) {
      case "home":
        return <HomePage offlineReady={offlineReady} />;
      case "new-tournament":
        return <CreateTournamentPage />;
      case "tournament":
        return <TournamentPage tournamentId={route.tournamentId} />;
      case "roster":
        return <RosterPage tournamentId={route.tournamentId} />;
      case "matches":
        return <MatchesPage tournamentId={route.tournamentId} />;
      case "pre-match":
        return <PreMatchPage matchId={route.matchId} />;
      case "live":
        return <LiveMatchPage matchId={route.matchId} />;
      case "match-summary":
        return <MatchSummaryPage matchId={route.matchId} />;
      case "tournament-summary":
        return <TournamentSummaryPage tournamentId={route.tournamentId} />;
      case "settings":
        return (
          <SettingsPage
            {...(route.tournamentId ? { tournamentId: route.tournamentId } : {})}
          />
        );
    }
  })();

  return (
    <div className={`app-shell ${route.name === "live" ? "app-shell--live" : ""}`}>
      {page}
      {(offlineReady || needRefresh) && (
        <aside className="pwa-status" aria-live="polite">
          {needRefresh ? (
            route.name === "live" ? (
              <span>Oppdatering klar etter kampen</span>
            ) : (
              <>
                <span>En ny versjon er klar</span>
                <Button
                  variant="primary"
                  onClick={() => void updateServiceWorker(true)}
                >
                  Oppdater
                </Button>
                <Button variant="quiet" onClick={() => setNeedRefresh(false)}>
                  Senere
                </Button>
              </>
            )
          ) : (
            <>
              <span>Klar uten nett</span>
              <Button variant="quiet" onClick={() => setOfflineReady(false)}>
                Lukk
              </Button>
            </>
          )}
        </aside>
      )}
    </div>
  );
}
