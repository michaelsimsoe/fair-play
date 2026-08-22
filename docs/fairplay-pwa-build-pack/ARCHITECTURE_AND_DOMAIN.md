# Architecture and Domain Design

## 1. Design principles

1. **Facts over plans.** Confirmed events are authoritative. Recommendations are disposable projections.
2. **Derive, do not duplicate.** Actual and ideal times are derived from the event stream.
3. **Monotonic while alive.** Use a monotonic source for active timing in the current page lifecycle.
4. **Recover with explicit uncertainty.** Use persisted wall-clock anchors only when monotonic continuity is lost.
5. **Pure domain core.** Fairness, event projection, and planning are framework-independent pure functions.
6. **Progressive enhancement.** Wake lock, vibration, audio, sharing, storage persistence, and install mode may fail.
7. **Offline-first.** The application shell and all core functionality work without a network after first load.
8. **Safe updates.** Never replace or reload a live session merely because a new service worker exists.
9. **Local privacy.** No runtime network calls except loading the static application itself and optional user-initiated deployment/update fetches.
10. **Determinism.** Equal inputs produce equal recommendations and tie-breaking.

## 2. Suggested directory structure

```text
src/
  app/
    App.tsx
    routes.tsx
    composition.ts
    ErrorBoundary.tsx
  domain/
    ids.ts
    types.ts
    events.ts
    commands.ts
    projection.ts
    availability.ts
    fairness.ts
    allocator.ts
    planner.ts
    plannerDiagnostics.ts
    validation.ts
  clock/
    ClockSource.ts
    BrowserClockSource.ts
    MatchClock.ts
    recovery.ts
    alertCrossings.ts
  storage/
    db.ts
    schema.ts
    migrations.ts
    tournamentRepository.ts
    matchRepository.ts
    activeMatchJournal.ts
    backup.ts
  platform/
    wakeLock.ts
    audioCue.ts
    vibration.ts
    fileShare.ts
    installMode.ts
    storagePersistence.ts
    visibility.ts
    serviceWorkerUpdate.ts
  features/
    home/
    tournament/
    roster/
    matchSetup/
    preMatch/
    liveMatch/
    matchSummary/
    tournamentSummary/
    settings/
  components/
  styles/
  i18n/
  test/
public/
  icons/
  seed/
```

The exact names may change. The dependency direction may not: browser and framework layers can call domain logic; domain logic cannot import them.

## 3. Core data types

All persisted types include a schema version either directly or through the database version. Use branded IDs or clear string aliases.

### Tournament

```ts
type Tournament = {
  id: TournamentId;
  name: string;
  date: string; // YYYY-MM-DD in tournament zone
  timezone: string; // e.g. Europe/Oslo
  teamName: string;
  coachLabel?: string;
  defaultMatchDurationMs: number;
  defaultPlayersOnField: number;
  defaultMinimumStintMs: number;
  defaultAlertLeadMs: number;
  fairnessScope: "tournament" | "match";
  createdAtWallMs: number;
  updatedAtWallMs: number;
  archivedAtWallMs?: number;
};
```

### Player

```ts
type Player = {
  id: PlayerId;
  tournamentId: TournamentId;
  name: string;
  normalizedName: string;
  sortOrder: number;
  active: boolean;
  createdAtWallMs: number;
  archivedAtWallMs?: number;
};
```

### Match

```ts
type Match = {
  id: MatchId;
  tournamentId: TournamentId;
  scheduledStartLocal?: string; // local date-time text or ISO with zone strategy
  opponent?: string;
  pitch?: string;
  notes?: string;
  plannedDurationMs: number;
  playersOnField: number;
  minimumStintMs: number;
  alertLeadMs: number;
  eligiblePlayerIds: PlayerId[];
  selectedStarterIds?: PlayerId[];
  status: "scheduled" | "ready" | "running" | "paused" | "completed" | "abandoned";
  createdAtWallMs: number;
  updatedAtWallMs: number;
};
```

### Event envelope

```ts
type MatchEventEnvelope<TType extends MatchEventType, TPayload> = {
  id: MatchEventId;
  matchId: MatchId;
  sequence: number;
  type: TType;
  elapsedMs: number; // active match timeline, excluding pauses
  recordedAtWallMs: number;
  payload: TPayload;
  source: "user" | "suggested-confirmation" | "recovery" | "system";
  schemaVersion: 1;
};
```

Sequence is the deterministic tie-breaker for events with the same elapsed time.

### Event types

At minimum:

```ts
type MatchEvent =
  | MatchStartedEvent
  | SubstitutionConfirmedEvent
  | LineupSynchronizedEvent
  | PlayerAvailabilityChangedEvent
  | MatchPausedEvent
  | MatchResumedEvent
  | MatchDurationChangedEvent
  | MatchEndedEvent
  | MatchAbandonedEvent
  | EventVoidedEvent
  | EventReplacedEvent;
```

Recommended payload details:

- `MATCH_STARTED`: starter lineup, available players, planned duration, field slots, configuration snapshot.
- `SUBSTITUTION_CONFIRMED`: outgoing IDs, incoming IDs, lineup before, lineup after, recommendation ID if applicable.
- `LINEUP_SYNCHRONIZED`: lineup before, lineup after, reason.
- `PLAYER_AVAILABILITY_CHANGED`: player, previous value, new value, scope/reason.
- `MATCH_PAUSED` and `MATCH_RESUMED`: optional reason.
- `MATCH_DURATION_CHANGED`: previous and new duration.
- `MATCH_ENDED`: final active elapsed and end reason.
- `EVENT_VOIDED`: target event ID and reason.
- `EVENT_REPLACED`: target event ID and complete replacement event payload.

A normal substitution can contain one or more simultaneous pairs. The central use case contains one pair.

## 4. Projection

A single pure projector takes:

- Match configuration.
- Tournament players.
- Ordered effective events.
- Optional projection end time for a running match.

It returns:

```ts
type MatchProjection = {
  status: MatchStatus;
  elapsedMs: number;
  currentLineupIds: PlayerId[];
  currentlyAvailableIds: PlayerId[];
  actualMsByPlayer: Record<PlayerId, number>;
  idealMsByPlayer: Record<PlayerId, number>;
  fairnessBalanceMsByPlayer: Record<PlayerId, number>;
  playingStintsByPlayer: Record<PlayerId, TimeInterval[]>;
  benchStintsByPlayer: Record<PlayerId, TimeInterval[]>;
  timelineSegments: TimelineSegment[];
  eventIssues: ProjectionIssue[];
};
```

### Interval integration

Between every two effective event times:

- Interval length is measured on the active elapsed timeline, so pauses require no special subtraction inside the projector.
- Add interval length to actual time for every player in the on-field lineup.
- Let `A` be the set of players available for that interval.
- Let `K` be field slots.
- If `|A| >= K`, add `interval × K / |A|` to ideal time for each available player.
- If `|A| < K`, add `interval` to each available player and emit a configuration issue because some field slots cannot be filled.
- Unavailable players receive no ideal increment.
- Use rational or high-precision internal arithmetic if needed, then round deterministically for display/export. Preserve exact total player-milliseconds when converting to integers.

Validate every lineup transition. Never silently drop an invalid outgoing player or add a duplicate incoming player. Emit an issue and keep enough information for a correction UI.

## 5. Clock architecture

### Clock source interface

```ts
interface ClockSource {
  monotonicNowMs(): number;
  wallNowMs(): number;
}
```

Production uses `performance.now()` and `Date.now()`. Tests use a fake source.

### In-memory clock state

```ts
type MatchClockState = {
  status: "idle" | "running" | "paused" | "ended";
  accumulatedActiveMs: number;
  resumedAtMonotonicMs?: number;
  resumedAtWallMs?: number;
  plannedDurationMs: number;
};
```

While running in the same page lifecycle:

```text
elapsed =
  accumulatedActiveMs
  + monotonicNow
  - resumedAtMonotonic
```

Clamp to the allowed active duration unless explicit overtime extends it.

`requestAnimationFrame` or a small render scheduler updates the display, but the callback count is never used to calculate elapsed time.

### Pause and resume

On pause:

- Calculate current elapsed from the monotonic source.
- Persist it.
- Clear live anchors.
- Append the pause event at that active elapsed value.

On resume:

- Append the resume event at the same active elapsed value.
- Set new monotonic and wall anchors.
- Persist immediately.

### Recovery journal

Persist a small active-match journal in IndexedDB, and optionally mirror the latest tiny snapshot in `localStorage` as an emergency hint:

```ts
type ActiveMatchJournal = {
  matchId: MatchId;
  clockStatus: "running" | "paused";
  elapsedAtSnapshotMs: number;
  snapshotWallMs: number;
  lastResumeWallMs?: number;
  plannedDurationMs: number;
  currentLineupIds: PlayerId[];
  lastEventSequence: number;
  savedAtWallMs: number;
};
```

Write the journal:

- At start.
- After every domain event.
- On pause/resume.
- On visibility change to hidden.
- On `pagehide`.
- On a modest heartbeat while running, for example every five seconds.

The heartbeat is for recovery only, not timer truth.

After reload, if the journal says running:

```text
estimatedElapsed =
  elapsedAtSnapshot
  + max(0, currentWallTime - snapshotWallTime)
```

Clamp it. Re-anchor the monotonic clock. Compare the wall-derived estimate with any other available anchors. If there is a suspicious jump, show a recovery review instead of silently asserting precision.

The app cannot guarantee correct elapsed time if the device wall clock is manually changed while the page is dead. Make uncertainty visible.

### Alert threshold crossings

Track the previous and current remaining time. Fire an alert when a threshold is crossed:

```text
previousRemaining > threshold
and
currentRemaining <= threshold
```

Record fired threshold IDs in volatile/session state so rendering cannot repeat the cue. If the page resumes after skipping several thresholds, issue one consolidated visible/audio cue rather than a burst.

## 6. Command transaction pattern

Every user action that changes history should follow:

1. Read current persisted match revision/event sequence.
2. Derive current projection at the command elapsed time.
3. Validate the command against the projection.
4. Create one or more events.
5. In one Dexie transaction, append events, update match metadata/status, and write the active journal.
6. Only after commit succeeds, update UI state and recalculate the recommendation.
7. If commit fails, retain the old visible state and show a blocking save error.

The live screen should show a small save-state indicator:

- `Lagret`
- `Lagrer …`
- `Lagring feilet`

Do not optimistically tell the coach a substitution was recorded before the transaction succeeds.

## 7. IndexedDB schema

Suggested tables:

```text
tournaments
players
matches
matchEvents
activeMatchJournals
appSettings
migrationMetadata
```

Indexes should cover:

- Players by tournament and sort order.
- Matches by tournament and schedule/order.
- Events by match and sequence.
- Journals by match.
- Updated timestamps as useful.

Use Dexie versioned upgrades. Include at least one tested migration path, even if v1 begins at schema version 1, by structuring migrations explicitly.

## 8. Import and export

Backup envelope:

```ts
type BackupEnvelope = {
  format: "fairplay-sideline-backup";
  schemaVersion: number;
  exportedAt: string;
  appVersion: string;
  data: {
    tournaments: Tournament[];
    players: Player[];
    matches: Match[];
    matchEvents: MatchEvent[];
    appSettings: AppSettings;
  };
};
```

Requirements:

- Validate with Zod before writing anything.
- Import inside a transaction.
- Detect ID conflicts.
- Support import as new/copy by remapping IDs.
- Never partially import.
- Provide useful validation paths.
- Round-trip tests must preserve projections.
- Use user-initiated Web Share with `File` when supported; fallback to Blob download.
- Do not require network access.

## 9. PWA and service worker

- Manifest with standalone display, appropriate theme/background colors, and locally generated icons.
- Include iOS touch icon metadata.
- Use `100dvh` with fallback and safe-area insets.
- Precache the application shell, local icons, and seed data.
- Avoid remote fonts and remote runtime assets.
- Use a prompt-based update strategy.
- If an update is detected during a running or paused match, defer activation and show only a non-disruptive indicator.
- Activate/reload only after the match is completed or the user explicitly leaves the live session after data is saved.
- Show an offline-ready state after successful service-worker installation.
- Make static-host base path configurable if practical.

## 10. Platform adapters

### Wake lock

- Feature-detect `navigator.wakeLock`.
- Request a `screen` lock from the start gesture.
- Listen for release.
- Re-request when the document becomes visible if the match is live.
- Handle rejection without breaking the match.
- Show status in the live UI.
- Never assume the lock remains active.
- Do not use a hidden video fallback.

### Audio

- Create or resume the audio context from a direct start/test gesture.
- Generate brief local tones with Web Audio or use a small bundled local asset.
- Handle suspended contexts after backgrounding.
- Show `Trykk for lyd` when a gesture is needed again.
- Never rely on audio as the only alert.

### Vibration

- Call only after checking that `navigator.vibrate` is a function.
- Treat failure as normal.
- Never make vibration part of an acceptance requirement on iPhone.

### Visibility and background

- Listen to visibility and page lifecycle events.
- Persist before losing visibility when possible.
- On return, recompute elapsed from anchors, reproject, and show any overdue recommendation.
- Do not promise background timers or alarms.

### Storage persistence

- Feature-detect `navigator.storage`.
- Request persistence after a meaningful user gesture such as first tournament save or backup prompt.
- Show denial only as a non-blocking storage note.
- Encourage export after a completed tournament.

## 11. Error handling

Include:

- Top-level React error boundary.
- Storage initialization failure screen with export/retry where possible.
- Corrupt active-journal recovery screen.
- Invalid event-stream diagnostics.
- Insufficient available-player warning.
- Save failure that blocks false confirmation.
- Service-worker update failure that leaves the current version usable.
- Import validation report.
- Clock anomaly review.

Use plain, non-technical Bokmål in user-facing errors and technical detail in development logs.
