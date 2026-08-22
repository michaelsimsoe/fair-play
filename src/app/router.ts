export type Route =
  | { name: "home" }
  | { name: "new-tournament" }
  | { name: "tournament"; tournamentId: string }
  | { name: "roster"; tournamentId: string }
  | { name: "matches"; tournamentId: string }
  | { name: "pre-match"; matchId: string }
  | { name: "live"; matchId: string }
  | { name: "match-summary"; matchId: string }
  | { name: "tournament-summary"; tournamentId: string }
  | { name: "settings"; tournamentId?: string };

let liveExitAllowed = false;

export function allowLiveExitOnce(): void {
  liveExitAllowed = true;
}

export function consumeLiveExitPermission(): boolean {
  const allowed = liveExitAllowed;
  liveExitAllowed = false;
  return allowed;
}

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "new") return { name: "new-tournament" };
  if (parts[0] === "tournament" && parts[1]) {
    if (parts[2] === "roster") {
      return { name: "roster", tournamentId: parts[1] };
    }
    if (parts[2] === "matches") {
      return { name: "matches", tournamentId: parts[1] };
    }
    if (parts[2] === "summary") {
      return { name: "tournament-summary", tournamentId: parts[1] };
    }
    if (parts[2] === "settings") {
      return { name: "settings", tournamentId: parts[1] };
    }
    return { name: "tournament", tournamentId: parts[1] };
  }
  if (parts[0] === "match" && parts[1]) {
    if (parts[2] === "live") return { name: "live", matchId: parts[1] };
    if (parts[2] === "summary") {
      return { name: "match-summary", matchId: parts[1] };
    }
    return { name: "pre-match", matchId: parts[1] };
  }
  if (parts[0] === "settings") return { name: "settings" };
  return { name: "home" };
}

export function routeHref(route: Route): string {
  switch (route.name) {
    case "home":
      return "#/";
    case "new-tournament":
      return "#/new";
    case "tournament":
      return `#/tournament/${route.tournamentId}`;
    case "roster":
      return `#/tournament/${route.tournamentId}/roster`;
    case "matches":
      return `#/tournament/${route.tournamentId}/matches`;
    case "pre-match":
      return `#/match/${route.matchId}`;
    case "live":
      return `#/match/${route.matchId}/live`;
    case "match-summary":
      return `#/match/${route.matchId}/summary`;
    case "tournament-summary":
      return `#/tournament/${route.tournamentId}/summary`;
    case "settings":
      return route.tournamentId
        ? `#/tournament/${route.tournamentId}/settings`
        : "#/settings";
  }
}

export function navigate(route: Route, replace = false): void {
  const href = routeHref(route);
  if (replace) {
    history.replaceState(null, "", href);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    window.location.hash = href.slice(1);
  }
}
