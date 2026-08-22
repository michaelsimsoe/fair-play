# FairPlay Sideline PWA — All-in-One Autonomous Build Handoff

This document concatenates the complete build pack. Treat every section as binding unless it explicitly says a constraint is optional.


---

<!-- BEGIN README.md -->

# FairPlay Sideline PWA — Autonomous Build Pack

## Purpose

This package is a self-contained implementation brief for an autonomous coding model. It describes a small, personal, client-side-only Progressive Web App for managing equal playing time during short children's football matches.

The primary user is a coach standing beside the pitch with an iPhone. The app must make the next substitution obvious, record what actually happened, and continually recalculate the remaining plan when reality differs from the original plan.

## Handoff

Give the entire folder or ZIP file to the implementation model and say:

> Read `MASTER_BUILD_PROMPT.md` and execute it end-to-end. Build the application, run all available quality gates, and return only when the repository contains a complete working implementation.

If the model accepts only one document, use `ALL_IN_ONE_HANDOFF.md`.

## Locked product decisions

- Web-based Progressive Web App.
- Client-side only.
- No account, backend, cloud database, analytics, or child data leaving the device.
- React, TypeScript, and Vite.
- Offline after the first successful load.
- IndexedDB is the durable local store.
- Actual match events are authoritative; planned substitutions are advisory.
- The match clock is derived from monotonic time while the page is alive, never from decrementing counters.
- The app must recover a running match after reload or foreground/background transitions as accurately as a browser permits.
- Screen Wake Lock, sound, vibration, file sharing, and storage persistence are progressive enhancements and must be capability-detected.
- The live-match screen is optimized for one-handed use, sunlight, stress, and large touch targets.
- The default interface language is Norwegian Bokmål, while code, tests, and technical documentation are English.
- The default fairness scope is the whole tournament/day, adjusted for player availability.
- The supplied Krokelvdalen tournament is sample/import data, not hardcoded as the only supported tournament.

## Files

- `MASTER_BUILD_PROMPT.md` — autonomous implementation mandate and delivery contract.
- `PRODUCT_SPEC.md` — goals, workflows, screens, behavior, and non-goals.
- `ARCHITECTURE_AND_DOMAIN.md` — stack, modules, event model, clock, storage, and PWA design.
- `FAIR_PLAY_ENGINE.md` — fairness accounting, target allocation, adaptive substitution planning, and examples.
- `UX_AND_COPY.md` — field-first interaction design, accessibility, and Bokmål copy.
- `TEST_AND_ACCEPTANCE.md` — automated tests, manual iPhone tests, and definition of done.
- `PLATFORM_NOTES.md` — browser constraints that must shape the implementation.
- `DELIVERY_CHECKLIST.md` — completion checklist for the implementation agent.
- `seed-krokelvdalen-2.json` — sample tournament data from the supplied schedule and roster.
- `ALL_IN_ONE_HANDOFF.md` — all Markdown documents concatenated for single-file handoff.

## Immediate reference scenario

Team: Krokelvdalen 2  
Players: Ask, Ali, Fredrik H, Lucas  
Players on the field: 3  
Match duration: 12 minutes  
Matches: four  
Total available player time: 4 × 12 × 3 = 144 player-minutes  
Equal tournament target: 36 minutes per player

With starters Ask, Ali, and Fredrik H, and Lucas on the bench, the normal equal-time plan is:

- 03:00 — Lucas in, Ask out
- 06:00 — Ask in, Ali out
- 09:00 — Ali in, Fredrik H out

Each player receives exactly 9:00 in that match when substitutions are confirmed on time.

<!-- END README.md -->


---

<!-- BEGIN MASTER_BUILD_PROMPT.md -->

# Master Build Prompt: FairPlay Sideline PWA

## Role

You are the senior implementation agent responsible for delivering this product from an empty or existing repository to a complete, tested, production-buildable Progressive Web App.

Do not stop after analysis, architecture, scaffolding, or a partial prototype. Read every file in this build pack, implement the application, run the quality gates, fix defects you find, and leave the repository in a usable state.

## Product mandate

Build a personal, client-side-only PWA that helps a coach give young football players approximately equal playing time during short matches.

The coach must be able to:

1. Create a tournament or match day.
2. Add players and matches.
3. Choose which players are available for a match.
4. Select the starting lineup.
5. Start an accurate match clock.
6. See the next recommended substitution and a countdown to it.
7. Confirm the substitution at the moment it actually happens.
8. Make an unplanned substitution or alter availability.
9. Have the app immediately recalculate the rest of the match.
10. See exactly who played during every interval.
11. Review match and tournament totals.
12. Close, reload, or temporarily background the app without silently corrupting the match record.
13. Use the app offline after its first successful load.
14. Export and import a complete local backup.

The app is advisory. It must never pretend that a planned substitution occurred. Only a confirmed or manually recorded event changes the actual lineup and playing-time ledger.

## Required operating behavior

- Work autonomously. Do not ask routine design questions that are already answered by this pack.
- Make small implementation choices when necessary, but do not weaken or remove the locked requirements.
- Use the latest stable package versions available at implementation time and commit a lockfile.
- Prefer official platform and package documentation when an API detail is uncertain.
- Do not use experimental browser capabilities as hard dependencies.
- Do not add a backend, authentication, remote database, analytics, telemetry, advertisements, or runtime CDN dependency.
- Do not add a native wrapper such as Capacitor in v1.
- Do not use a hidden looping video or similar hack to force the iPhone screen awake.
- Do not use `setInterval(() => remaining--)`, accumulated render ticks, or callback counts as clock truth.
- Do not store mutable per-player totals as the source of truth. Derive them from events and availability intervals.
- Do not automatically reload the app to activate a service-worker update during a live match.
- Do not leave placeholder screens, TODO implementations, fake buttons, or untested core domain logic.

## Expected technology

Use:

- React
- TypeScript in strict mode
- Vite
- A maintained Vite PWA/service-worker integration
- Dexie over IndexedDB
- Zod or an equivalent runtime schema validator for imports and persisted schema boundaries
- Vitest
- React Testing Library
- Playwright for critical browser flows where practical
- ESLint
- Prettier or an equivalent deterministic formatter

Use plain CSS, CSS Modules, or another lightweight styling approach. Avoid a heavy component library. Use system fonts and no remote font request.

A small state library is acceptable, but keep the deterministic domain engine independent of React and independently testable.

## Required repository outputs

At minimum, leave:

- A complete application source tree.
- A deterministic domain layer.
- An IndexedDB repository layer with schema versioning and migrations.
- A working web app manifest and service worker.
- PWA icons generated from repository-owned SVG or other local assets.
- Unit tests for the clock, projections, fairness accounting, and substitution planner.
- Component/integration tests for the central flows.
- At least a small Playwright suite for create/open/start/confirm/reload/offline flows where the test environment permits.
- The supplied seed tournament importable through the UI or loadable as sample data.
- A concise repository `README.md` with setup, development, testing, build, static deployment, iPhone installation, backup, and known platform limitations.
- Scripts for `dev`, `build`, `preview`, `typecheck`, `lint`, `test`, and `test:e2e`.
- A production build that succeeds without network access to runtime resources.

## Implementation order

Use this order unless the existing repository makes another order clearly safer:

1. Establish tooling, strict typing, formatting, linting, test runner, and directory boundaries.
2. Implement pure domain types, event projection, availability-adjusted fairness accounting, and tests.
3. Implement the match clock behind an injected clock-source interface and test it with fake time.
4. Implement the target allocator and adaptive substitution planner with deterministic tie-breaking and tests.
5. Implement IndexedDB storage, migrations, transactions, import/export, and recovery snapshots.
6. Implement app state and navigation.
7. Implement tournament, roster, and match setup.
8. Implement pre-match selection.
9. Implement the live-match screen and event controls.
10. Implement post-match and tournament summaries.
11. Implement PWA/offline behavior, wake-lock capability handling, audio initialization, and update deferral.
12. Add the seed tournament.
13. Run all quality gates, manually inspect the built application at mobile widths, and resolve defects.
14. Document any physical-iPhone behavior that could not be tested. Never claim hardware testing that did not occur.

## Architecture requirements

The implementation must preserve these boundaries:

- `domain/`: pure types, commands, events, projection, fairness, planner, formatting-independent logic.
- `clock/`: monotonic active-time engine, recovery, alert-threshold crossing.
- `storage/`: Dexie schema, repositories, migrations, import/export.
- `platform/`: wake lock, audio, vibration, share/download, install mode, visibility handling.
- `features/`: tournament, setup, pre-match, live match, summaries, settings.
- `app/`: routing, dependency composition, error boundaries.

Names may differ, but domain logic must not depend on React, Dexie, browser DOM APIs, or wall-clock globals.

## Quality standard

Core functions must be deterministic and testable. Time values are integer milliseconds. Identifiers are generated with `crypto.randomUUID()` or an equivalent local mechanism. Persisted data has an explicit schema version. Every domain event has a stable sequence and timestamp on the active match timeline.

The normal four-player, three-field-slot, twelve-minute case must produce exact nine-minute targets and the expected three-minute rotation. Delays and manual changes must be reflected as actual history and trigger a new plan rather than rewriting the past.

The UI must remain understandable without color alone. It must use large touch targets, safe-area insets, tabular timer digits, and a layout that works in portrait and landscape on an iPhone.

## Completion gate

Before finishing, run and report the actual results of:

```text
npm install
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
```

Adapt commands only if the package manager differs. Fix failures rather than omitting them. If an E2E test cannot run because the environment lacks the required browser binary or sandbox permission, state that precisely and still provide the suite.

Also verify:

- The built app starts from a clean browser profile.
- The seed data imports.
- A match can be started, paused, resumed, substituted, ended, and reviewed.
- Reload during a running match reconstructs elapsed time and lineup.
- A service-worker update does not force a live-match reload.
- The app shell works offline after first load.
- Exported data can be imported into a clean database.
- No runtime request is made to a remote font, analytics endpoint, or API.
- No core feature depends on vibration, wake lock, notifications, or background execution.

## Final response contract

Return a concise implementation report containing:

- What was built.
- Important architecture decisions.
- Commands run and pass/fail results.
- How to launch it.
- How to install it on an iPhone.
- What was not physically testable.
- Any genuine remaining limitation.

Do not respond with another proposal or a list of future possibilities in place of the implementation.

<!-- END MASTER_BUILD_PROMPT.md -->


---

<!-- BEGIN PRODUCT_SPEC.md -->

# Product Specification

## 1. Product summary

**Working title:** FairPlay Sideline

FairPlay Sideline is a private, offline-capable coaching timer for short children's football matches. It combines a match clock, an equal-playing-time planner, and an auditable record of the lineup over time.

It is designed for the moment when a coach is watching the game, helping children, and cannot mentally track four or more individual minute totals. The live screen should answer four questions at a glance:

1. How much match time remains?
2. How long until the next recommended change?
3. Who should enter?
4. Who should leave?

Everything else is secondary during live play.

## 2. Primary user and environment

The primary user is one adult coach:

- Standing outdoors beside a pitch.
- Holding an iPhone in one hand.
- Frequently looking away from the device.
- Working in sunlight, noise, rain, interruptions, and time pressure.
- Managing seven-year-old players.
- Sometimes confirming a substitution later than planned.
- Sometimes making a different substitution because a child is tired, hurt, unavailable, distracted, or wants to leave the field.
- Expecting the app to remember the real history and adapt.

The target browser is current Safari and an iPhone Home Screen web app, with modern Chromium browsers as secondary targets.

## 3. Goals

### Essential goals

- Keep a trustworthy active-time match clock.
- Make equal playing time easy to pursue.
- Recalculate after every real-world deviation.
- Record actual lineup intervals.
- Preserve data locally and offline.
- Recover gracefully after reload or temporary backgrounding.
- Minimize attention and taps during a match.
- Provide tournament-level totals, not only per-match totals.

### Quality goals

- First useful screen in under a second on a warmed PWA.
- No remote runtime dependency.
- No user account.
- No child information leaves the device.
- No accidental data loss from an ordinary app refresh.
- No hidden assumptions that all substitutions occur on schedule.
- Deterministic recommendations for the same state.
- Clear explanation when perfect equality is no longer mathematically possible in the current match.

## 4. Non-goals for v1

- Goals, scores, formations, tactics, positions, assists, or performance ratings.
- Team chat, parent communication, roster invitations, or multi-user collaboration.
- Cloud sync.
- Authentication.
- Native iOS Live Activities, Dynamic Island, AlarmKit, or Apple Watch integration.
- Reliable alarms while the web app is backgrounded or the phone is locked.
- A native wrapper.
- Location tracking.
- Photos of children.
- Public sharing or social features.
- Automatic detection of substitutions.
- Support for multiple simultaneous devices editing the same tournament.
- A general league-management platform.

## 5. Core concepts

### Tournament

A match day containing a team, players, defaults, and ordered matches. Fairness is normally evaluated across the tournament.

### Player

A locally stored first name or label. A player may be active for the tournament and available or unavailable for a particular match or interval.

### Match

A scheduled or ad hoc game with opponent, time, pitch, planned duration, number of field slots, eligible players, status, and an event stream.

### Actual event

A user-confirmed fact on the active match timeline, such as starting the match, a substitution, a pause, an availability change, a lineup correction, or ending the match.

### Recommendation

A computed suggestion. It is not history and has no effect on playing time until confirmed or replaced by a manual action.

### Actual playing time

The integral of active match time during which a player belongs to the projected on-field lineup.

### Ideal playing time

During every active interval, the available field-slot time is divided equally among players marked available for that interval. This produces an availability-adjusted target.

### Fairness balance

`actual playing time - ideal playing time`

A negative value means the player is owed time relative to the current fairness target. A positive value means the player has received more than the target. The planner minimizes the spread of these balances while respecting the remaining time and practical substitution constraints.

## 6. Primary workflow

### 6.1 Create or open tournament

The home screen shows local tournaments, last opened tournament, active match recovery, create, import, and data-management actions.

Creating a tournament asks for:

- Tournament name.
- Date.
- Team name.
- Time zone, defaulting to the device zone.
- Default match duration, default 12:00.
- Default number of players on the field, default 3.
- Optional preferred minimum stint, default 60 seconds.
- Alert lead time, default 10 seconds.

### 6.2 Add players

The roster screen supports:

- Add by name.
- Edit.
- Reorder.
- Mark inactive for the tournament.
- Delete only when no history references the player; otherwise archive.
- Prevent blank or duplicate normalized names inside one tournament unless explicitly confirmed.

### 6.3 Add matches

Each match supports:

- Scheduled start.
- Opponent.
- Pitch/field.
- Planned duration.
- Players on field.
- Notes.
- Reordering.
- Duplicate.
- Delete when not started.
- Reset only behind a destructive confirmation after start.

Matches have statuses:

- `scheduled`
- `ready`
- `running`
- `paused`
- `completed`
- `abandoned`

### 6.4 Pre-match

The pre-match screen must:

- Show the match details.
- Show cumulative tournament actual time, ideal time, and fairness balance per player.
- Allow the coach to mark players available or unavailable for this match.
- Recommend starters based on fairness debt and practical rotation order.
- Allow the coach to override the recommendation.
- Require exactly `playersOnField` starters.
- Show the bench.
- Preview the first recommended change and expected final totals.
- Explain any impossible configuration, such as fewer available players than field slots.
- Include a large start button.

Starting the match must occur from a direct user gesture. In the same gesture path, the application should attempt to initialize/resume the audio context and request a screen wake lock. Failure of either enhancement must not block the match.

### 6.5 Live match

The live screen contains, in priority order:

1. Match remaining timer.
2. Next-change countdown or overdue counter.
3. Large incoming and outgoing player labels.
4. A large confirm-change button.
5. Current on-field and bench player cards with actual playing time.
6. Manual action controls.
7. Pause/end/undo controls.

The screen must not require scrolling for the main four-player use case on a normal iPhone in portrait orientation.

#### Normal recommendation behavior

Before the due time:

- Show `Neste bytte om 02:14`.
- Show `Lucas inn`.
- Show `Ask ut`.
- Allow `Bytt nå` to perform the recommendation early.

At the due time:

- Play the configured audible cue if audio is available.
- Attempt vibration only if the API exists.
- Switch to a strong visual alert.
- Show `BYTT NÅ`.
- Continue the real match clock.
- Show how overdue the recommendation is.
- Do not record the substitution automatically.

When the coach taps confirm:

- Record the substitution at the actual current active-match elapsed time.
- Persist it before presenting the next plan.
- Update the actual lineup.
- Recalculate fairness and the remainder.
- Show the next recommendation.

#### Manual substitution

A manual action must allow:

- Tap or choose the player leaving.
- Tap or choose the player entering.
- Review the pair.
- Confirm now.
- Record the actual time and source as manual.
- Recalculate immediately.

#### Skip or recalculate

The coach may decide not to follow a due recommendation while keeping the current lineup. A `Recalculate now` action updates the recommendation from the current moment without inventing a substitution event.

#### Availability change

The coach can mark a player temporarily unavailable or available:

- Unavailable players stop accumulating ideal target time from the effective event onward.
- They are excluded from recommendations.
- If marked unavailable while on the field, the UI immediately requests a replacement when enough players are available.
- Re-enabling the player makes them eligible from that moment; missed unavailable time is not automatically owed.

#### Pause

Pause freezes active match elapsed time and all actual/ideal accumulation. It records a pause event. Resume records a resume event and creates new clock anchors.

#### End

At planned zero:

- Clamp active elapsed time at the planned duration.
- Alert visibly and audibly if possible.
- Stop adding playing time.
- Present `Avslutt kamp`.
- Allow an explicit overtime/continue action in small fixed increments or a custom duration.
- Do not silently accrue beyond the planned duration.

Ending the match records an event and opens the summary.

### 6.6 Post-match summary

Show:

- Actual duration.
- Actual playing time per player.
- Ideal playing time per player.
- Balance for the match.
- Tournament cumulative actual, ideal, and balance.
- Number and duration of playing stints.
- Longest bench interval.
- A visual timeline of who was on the field.
- Event log.
- Undo/correction entry point.
- Next scheduled match.

A correction must preserve an audit trail. It may append a replacement/void event rather than mutating history silently. Reproject all totals after correction and flag invalid downstream substitutions rather than guessing.

### 6.7 Tournament summary

Show:

- Match list and status.
- Actual total per player.
- Ideal total per player.
- Fairness balance.
- Difference between the highest and lowest balance.
- Total player-minutes distributed.
- Per-match expandable details.
- Export backup.
- Start/open next match.

Use neutral language. Do not rank or praise children based on minutes.

## 7. Adaptive behavior

The planner must be recalculated after:

- Match start.
- Every confirmed suggested substitution.
- Every manual substitution.
- A delayed confirmation.
- An early confirmation.
- Availability change.
- Pause/resume when relevant.
- Match duration change.
- Overtime.
- Undo or correction.
- Reload recovery.
- `Recalculate now`.

Past actual events are never moved merely to make a new plan look cleaner.

If perfect equality is impossible in the remaining match, the app should produce the best feasible plan and carry the balance into later matches. It should be able to say, in plain language, that one player is projected to finish, for example, 30 seconds below the current target and that the next match will compensate.

## 8. Settings

Tournament defaults:

- Match duration.
- Players on field.
- Minimum preferred stint.
- Alert lead time.
- Sound on/off.
- Visual flash on/off.
- Vibration on/off when supported.
- Fairness scope: tournament by default; match-only optional.
- Time display: `mm:ss`.
- Interface language, with Bokmål default and English optional if implemented.

Settings that affect fairness must be stored with the tournament or match so later replay is stable.

## 9. Data management

The app must support:

- Explicit local-only privacy statement.
- Export all data as versioned JSON.
- Import as a new tournament or full restore with validation.
- Prefer Web Share with a file when supported; otherwise download a JSON file.
- Request persistent storage opportunistically; denial is non-fatal.
- Show last successful local save time during a live match.
- Clear all data behind a typed or multi-step destructive confirmation.
- Database migrations.
- Recovery from malformed imported data with actionable validation messages.

## 10. Sample tournament

Bundle or expose an import action for the supplied sample:

- Tournament date: 2026-08-22
- Team: Krokelvdalen 2
- Coach label: Michael
- Players: Ask, Ali, Fredrik H, Lucas
- Three players on the field
- Twelve-minute matches
- 11:00, pitch 2, Reinen Hvit
- 11:30, pitch 2, TUIL 3
- 12:30, pitch 2, TUIL 4
- 13:00, pitch 3, Reinen Blå

The sample is demonstration data and must be deletable.

<!-- END PRODUCT_SPEC.md -->


---

<!-- BEGIN ARCHITECTURE_AND_DOMAIN.md -->

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
  status:
    | "scheduled"
    | "ready"
    | "running"
    | "paused"
    | "completed"
    | "abandoned";
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

<!-- END ARCHITECTURE_AND_DOMAIN.md -->


---

<!-- BEGIN FAIR_PLAY_ENGINE.md -->

# Fair-Play Engine

## 1. Objective

The engine must distribute available field time as equally as practical while respecting what actually happened.

It has two independent responsibilities:

1. **Fairness accounting:** calculate actual time, ideal availability-adjusted time, and each player's balance.
2. **Future planning:** allocate the remaining field time and turn that allocation into practical substitution recommendations.

Past history is immutable from the planner's perspective. It may compensate later; it may not rewrite earlier events.

## 2. Fairness accounting

For each active timeline interval of duration `d`:

- `K` = number of field slots.
- `A` = players marked available.
- `L` = actual on-field lineup.

Actual increment:

```text
actual[player] += d
for every player in L
```

Ideal increment when `|A| >= K`:

```text
ideal[player] += d × K / |A|
for every player in A
```

Balance:

```text
balance[player] = actual[player] - ideal[player]
```

Interpretation:

- Negative: the player is owed time relative to availability.
- Positive: the player has received extra time.
- Zero: exactly on target.

The ideal calculation means a player absent for an entire match does not return with a debt for time when they were unavailable. A player temporarily unavailable does not accumulate target time during that interval.

For the normal scenario with four available players and three slots:

```text
ideal rate per player = 3 / 4
```

Over twelve minutes, each player's ideal is nine minutes.

## 3. Tournament versus match scope

### Tournament scope — default

Use cumulative balances from all matches in the tournament. This lets later matches compensate for unavoidable differences in earlier matches.

### Match-only scope

Reset starting balances to zero at match start. Still use current-match availability-adjusted ideal time.

The selected scope is stored in the tournament/match configuration and included in planner diagnostics.

## 4. Remaining-time allocation

At a planning moment:

- `E` = currently available players.
- `n = |E|`.
- `K` = field slots.
- `R` = remaining active match time.
- `b_i` = each player's current fairness balance in the selected scope.
- `x_i` = future actual playing time to allocate to player `i`.

Constraints:

```text
0 <= x_i <= R
sum(x_i) = K × R
```

The ideal future increment is equal for every currently available player:

```text
futureIdeal = K × R / n
```

Because that value is equal for all players, minimizing the spread of final balances is equivalent to equalizing:

```text
b_i + x_i
```

subject to the bounds.

### Bounded water-filling solution

Find a level `L` such that:

```text
x_i = clamp(L - b_i, 0, R)
sum(x_i) = K × R
```

This is a bounded water-filling problem.

Implement it as a pure deterministic function. Binary search is acceptable:

```ts
function allocateRemaining(
  balances: Record<PlayerId, number>,
  remainingMs: number,
  fieldSlots: number,
  orderedPlayerIds: PlayerId[],
): Record<PlayerId, number> {
  const capacity = remainingMs * fieldSlots;

  // Find a level for which the clamped allocations consume capacity.
  // Use enough iterations for sub-millisecond numerical accuracy.
  // Convert to integer milliseconds at the end.
}
```

### Integer rounding

Persist and schedule integer milliseconds.

After calculating floating allocations:

1. Floor each allocation.
2. Compute the remaining integer milliseconds required to reach exactly `K × R`.
3. Distribute one millisecond at a time by largest fractional remainder.
4. Break ties by stable player order.
5. Assert every allocation is within `[0, R]`.
6. Assert the exact sum equals capacity.

Do not allow floating-point drift to create or destroy field time.

## 5. Normal cyclic plan

When starting balances are equal and the initial lineup contains `K` of `n` players, the deterministic normal plan is a cyclic rotation.

Construct an ordered ring:

```text
ring = selected starters in user order + bench players in deterministic order
```

Divide the match into `n` equal-duration conceptual segments:

```text
segment duration = match duration / n
```

For segment `s`, use `K` consecutive players in the ring:

```text
lineup(s) = ring[s], ring[s+1], ..., ring[s+K-1] mod n
```

Each segment transition removes one player and adds one player when `K < n`.

Every player appears in exactly `K` of the `n` segments and therefore receives:

```text
K × duration / n
```

For four players, three slots, and twelve minutes:

```text
segment = 12:00 / 4 = 3:00
target per player = 3 × 3:00 = 9:00
```

With ring `[Ask, Ali, Fredrik H, Lucas]`:

```text
00:00–03:00  Ask, Ali, Fredrik H
03:00–06:00  Ali, Fredrik H, Lucas
06:00–09:00  Fredrik H, Lucas, Ask
09:00–12:00  Lucas, Ask, Ali
```

Recommendations:

```text
03:00 Lucas in, Ask out
06:00 Ask in, Ali out
09:00 Ali in, Fredrik H out
```

The adaptive planner should naturally reproduce this plan through its tie-breaking, and the exact sequence is an acceptance test.

## 6. Adaptive sequencing

The allocator says how much future time each player should receive. The sequencer decides when to change and whom to swap.

### Inputs

```ts
type PlannerInput = {
  nowElapsedMs: number;
  plannedEndElapsedMs: number;
  fieldSlots: number;
  orderedAvailablePlayerIds: PlayerId[];
  currentLineupIds: PlayerId[];
  balancesMsByPlayer: Record<PlayerId, number>;
  currentFieldStintMsByPlayer: Record<PlayerId, number>;
  currentBenchStintMsByPlayer: Record<PlayerId, number>;
  minimumPreferredStintMs: number;
  preferredChangeIntervalMs: number;
  previousRecommendation?: Recommendation;
};
```

Default:

```text
preferredChangeInterval = full planned match duration / available player count
```

This default produces the cyclic plan for equal balances.

### Feasibility timing

Let `need_i` be the allocated future actual time for player `i`.

For a bench player `j`, the latest they can remain on the bench before even a continuous final stint becomes insufficient is:

```text
latestEntryDelay_j = R - need_j
```

For an on-field player `i`, the maximum they can remain continuously on the field without exceeding their allocation is:

```text
maxStayDelay_i = need_i
```

A fairness-exact next boundary therefore cannot be later than:

```text
min(
  preferredChangeInterval,
  minimum latestEntryDelay among bench players,
  minimum maxStayDelay among on-field players,
  R
)
```

Values at or below zero imply an immediate boundary.

### Advance and choose

At a simulated boundary after delay `d`:

1. Subtract `d` from the future need of each current on-field player.
2. Reduce `R` by `d`.
3. Choose incoming candidates by:
   - Highest `need / R`.
   - Most negative projected balance.
   - Longest current bench stint.
   - Stable player order.
4. Choose outgoing candidates by:
   - Lowest `need / R`.
   - Most positive projected balance.
   - Longest current field stint.
   - Avoid removing a just-entered player when another choice is equivalent.
   - Stable player order.
5. Swap one pair.
6. If several players are simultaneously forced by zero slack/need, allow a substitution batch.
7. Continue simulation to produce a preview, but expose only the first action as the live recommendation.

The production implementation may use a bounded deterministic beam search around these candidate choices if that improves short-stint behavior. It must remain pure, deterministic, and well tested.

## 7. Practical constraints

Fairness is the primary objective, but a plan with many tiny stints is poor for young children.

Soft constraints:

- Default preferred minimum stint: 60 seconds.
- Avoid taking a player off less than the preferred minimum after they entered.
- Avoid putting a player in for a final stint shorter than 45 seconds merely to improve the balance by a trivial amount.
- Prefer fewer substitutions when fairness outcomes are equivalent.
- Prefer not to leave one player on the bench for more than roughly twice the normal change interval when alternatives are equivalent.
- Do not propose simultaneous multi-player changes unless required or clearly better.
- Do not replace an immediate fairness-critical swap with a long wait merely to satisfy a soft minimum stint.

A useful terminal plan score, lexicographically or by safely separated weights, is:

1. Lowest final fairness-balance range.
2. Lowest maximum absolute balance.
3. Fewest infeasible target milliseconds.
4. Fewest sub-minimum stints.
5. Lowest maximum bench stint.
6. Fewest substitutions.
7. Stable deterministic tie-break.

Do not conceal a fairness sacrifice. Planner diagnostics should report the projected result.

## 8. Recommendation structure

```ts
type Recommendation = {
  id: string;
  calculatedAtElapsedMs: number;
  dueAtElapsedMs: number;
  swaps: Array<{
    outgoingPlayerId: PlayerId;
    incomingPlayerId: PlayerId;
  }>;
  projectedActualMsByPlayer: Record<PlayerId, number>;
  projectedIdealMsByPlayer: Record<PlayerId, number>;
  projectedBalanceMsByPlayer: Record<PlayerId, number>;
  projectedBalanceRangeMs: number;
  reasons: Array<
    | "normal-rotation"
    | "player-behind-target"
    | "player-ahead-of-target"
    | "availability-change"
    | "manual-deviation"
    | "short-time-remaining"
  >;
  diagnostics: {
    perfectTargetFeasible: boolean;
    expectedSubstitutionCount: number;
    shortStintWarnings: PlayerId[];
  };
};
```

A recommendation ID can be stored in the confirmed event for audit, but the recommendation itself does not need to be permanent history.

## 9. Delayed substitution example

Initial plan:

- Ask, Ali, and Fredrik H start.
- Lucas should enter for Ask at 03:00.

Suppose the coach confirms that change at 03:27.

At 03:27:

- Ask, Ali, Fredrik H actual: 03:27 each.
- Lucas actual: 00:00.
- Each player's ideal: 02:35.25.
- Balances:
  - Ask: +00:51.75
  - Ali: +00:51.75
  - Fredrik H: +00:51.75
  - Lucas: -02:35.25

There are 08:33 left. Lucas must play the entire remainder to get as close as possible. Exact 09:00 each is no longer feasible in this match because Lucas cannot recover the 27 seconds already missed.

The optimal raw final actual totals are approximately:

- Lucas: 08:33
- Each other player: 09:09

The ideal final target remains 09:00 each, producing:

- Lucas balance: -00:27
- Each other player balance: +00:09

The balance range is 36 seconds. The next match should favor Lucas by carrying this balance forward.

The app must not pretend the first change happened at 03:00.

## 10. Manual substitution example

At 04:10, Fredrik H asks to leave, although the recommendation says Ask out and Lucas in.

The coach records:

```text
Lucas in, Fredrik H out at 04:10
```

The engine:

1. Appends that actual event.
2. Projects the real lineup.
3. Recalculates balances.
4. Allocates the remaining field time.
5. Generates a new next action.

It does not force the old plan or edit the event time.

## 11. Availability example

Lucas becomes temporarily unavailable at 05:00 while on the bench.

From 05:00 onward:

- Lucas is excluded from the available set.
- Lucas receives no ideal-time increment.
- The remaining three players can occupy all three field slots.
- No substitution is required while only those three are available.

Lucas becomes available again at 08:00:

- Lucas begins accumulating ideal target time again.
- The planner evaluates current balances from that moment.
- The three unavailable minutes are not owed automatically.

## 12. Edge cases

The engine must handle:

- `available count == field slots`: all available players play; no recommendation.
- `available count < field slots`: warn; all available players play; empty slots are not invented.
- `field slots <= 0`: validation error.
- `field slots > roster size`: validation error or explicit warning before match.
- Zero remaining time: no substitution.
- Immediate recommendation at match start due carried fairness debt.
- Multiple events at the same elapsed time using sequence order.
- Manual substitution inconsistent with current lineup: reject before persistence.
- Incoming player already on field: reject.
- Outgoing player not on field: reject.
- Unavailable incoming player: reject unless availability is changed in the same command transaction.
- Batch substitution with duplicate IDs: reject.
- Overtime that changes remaining allocation.
- Voided/replaced event that makes later events invalid: surface projection issues.
- Numerical rounding while preserving exact total player-milliseconds.
- Stable tie-breaking across reloads and browsers.

## 13. Required unit tests

At minimum:

1. Four players, three slots, twelve minutes, equal balances:
   - 03:00 Lucas for Ask.
   - 06:00 Ask for Ali.
   - 09:00 Ali for Fredrik H.
   - 09:00 final actual per player.
2. Five players, three slots, twelve minutes:
   - 07:12 target per player.
   - Practical cyclic changes.
   - Exact total of 36 player-minutes.
3. Six players, three slots, twelve minutes:
   - 06:00 target per player.
4. No bench:
   - No recommendation.
5. First change confirmed 27 seconds late:
   - Actual history uses 03:27.
   - Planner detects perfect current-match equality is impossible.
   - Projected balances are optimal or within a one-second deterministic tolerance.
6. Next match uses carried balance to compensate.
7. Player absent for one match:
   - No ideal time accrues while absent.
   - No whole-match catch-up debt is created.
8. Temporary unavailability:
   - Ideal target pauses for that player.
9. Manual substitution:
   - New plan starts from real lineup.
10. Pause:
   - Neither actual nor ideal time changes during the pause.
11. Integer allocator:
   - Exact capacity sum for randomized valid inputs.
   - Every allocation is within bounds.
12. Determinism:
   - Repeated calls with identical input produce deeply equal output.
13. Short-time remainder:
   - Avoid a useless micro-stint when fairness improvement is below configured tolerance.
14. Batch-forced case:
   - No duplicate or invalid lineup.

<!-- END FAIR_PLAY_ENGINE.md -->


---

<!-- BEGIN UX_AND_COPY.md -->

# UX and Copy

## 1. Field-first design rules

- Design for one hand and partial attention.
- Main live actions must be reachable with the thumb.
- Minimum touch target: 48 × 48 CSS pixels; prefer 56 or larger.
- Use high contrast and do not communicate field/bench state by color alone.
- Use system fonts.
- Use `font-variant-numeric: tabular-nums` for all timers.
- Use `100dvh` with fallback and `env(safe-area-inset-*)`.
- Avoid horizontal scrolling.
- Do not disable browser zoom globally.
- Avoid drag-and-drop as the only way to set a lineup.
- Avoid tiny icon-only destructive controls.
- Live screen primary actions should not require a modal unless the action is destructive or ambiguous.
- Provide undo after an action rather than adding confirmation friction to every normal substitution.
- Respect `prefers-reduced-motion`.
- Keep the live screen usable in portrait and landscape.
- Use a strong daylight mode and a dark mode; default to system preference, with an easy field-mode toggle.
- Prevent accidental text selection on live controls, but preserve accessibility elsewhere.

## 2. Navigation

Suggested top-level views:

1. Home
2. Tournament overview
3. Roster
4. Matches
5. Pre-match
6. Live match
7. Match summary
8. Tournament summary
9. Settings/data

During a live match, navigation away should require a clear action. Browser back should show a sheet:

```text
Kampen pågår
Klokka fortsetter. Vil du gå til kampoversikten?
```

Do not end or pause merely because the user navigates.

## 3. Bokmål terminology

Use consistent Bokmål. Suggested strings:

| English concept | Bokmål UI |
|---|---|
| Tournament / match day | Spilldag |
| Team | Lag |
| Players | Spillere |
| Matches | Kamper |
| Pitch | Bane |
| Match duration | Kamplengde |
| Players on field | Spillere på banen |
| Available | Tilgjengelig |
| Unavailable | Ikke tilgjengelig |
| Starting lineup | Startoppstilling |
| Bench | Benk |
| On field | På banen |
| Start match | Start kamp |
| Pause | Pause |
| Resume | Fortsett |
| End match | Avslutt kamp |
| Match remaining | Igjen av kampen |
| Next change | Neste bytte |
| Change in | Bytte om |
| Change now | BYTT NÅ |
| Incoming | inn |
| Outgoing | ut |
| Confirm change | Byttet er gjort |
| Do it now | Bytt nå |
| Manual change | Manuelt bytte |
| Recalculate now | Beregn på nytt |
| Undo last action | Angre siste handling |
| Saved | Lagret |
| Saving | Lagrer … |
| Save failed | Lagring feilet |
| Sound ready | Lyd klar |
| Tap for sound | Trykk for lyd |
| Screen awake | Skjermen holdes våken |
| Wake lock unavailable | Hold skjermen våken manuelt |
| Match finished | Kampen er ferdig |
| Overtime | Ekstratid |
| Playing time | Spilletid |
| Ideal time | Måltid |
| Difference | Avvik |
| Event log | Hendelser |
| Export backup | Eksporter sikkerhetskopi |
| Import backup | Importer sikkerhetskopi |
| Offline ready | Klar uten nett |

`Måltid` can be confused with a meal. Prefer the fuller label `Rettferdig mål` or `Mål for spilletid` in detailed summaries. In the live view, show only actual time.

## 4. Home screen

Content:

- App title.
- `Fortsett aktiv kamp` card when a journal exists.
- Last tournament.
- `Ny spilldag`.
- `Importer`.
- Local privacy note.
- Offline-ready/update state.

Do not show sample data automatically as if it were the user's real data. Provide `Last inn eksempel` or import the supplied file.

## 5. Tournament overview

Header:

```text
Krokelvdalen 2
Spilldag 22. august 2026
```

Next match card:

```text
Neste kamp
11:00 · Bane 2
mot Reinen Hvit
```

Primary button:

```text
Gjør klar kamp
```

Player balance list can show:

```text
Ask       18:03   +0:03
Ali       17:54   -0:06
Fredrik H 18:01   +0:01
Lucas     18:02   +0:02
```

Explain the sign in an info sheet. Do not use red/green judgment language for small harmless differences.

## 6. Pre-match screen

Sections:

1. Match details.
2. Availability.
3. Start lineup.
4. Bench order/preview.
5. Start controls.

Player card example:

```text
Ask
Totalt 18:03 · avvik +0:03
[På banen]
```

Selection behavior:

- Tapping toggles starter status until exactly K are selected.
- Unavailable state is a separate explicit control.
- Show count: `3 av 3 valgt`.
- Recommend but do not lock.
- Allow `Bruk anbefalt startoppstilling`.

Preview:

```text
Første planlagte bytte
03:00
Lucas inn · Ask ut
```

Start button:

```text
START KAMP
```

An optional small `Test lyd` button should exist before start.

## 7. Live screen layout

A suggested portrait hierarchy:

```text
┌────────────────────────────────┐
│ Reinen Hvit · Bane 2           │
│                        Lagret   │
│                                │
│             08:42              │
│          igjen av kampen       │
│                                │
│       Neste bytte om 00:42     │
│                                │
│          LUCAS INN             │
│           ASK UT               │
│                                │
│      [ BYTTET ER GJORT ]       │
│                                │
│ På banen                       │
│ Ask 03:18  Ali 03:18 Fredrik…  │
│ Benk                           │
│ Lucas 00:00                    │
│                                │
│ [Manuelt bytte] [Pause] [•••]  │
└────────────────────────────────┘
```

When due:

```text
BYTT NÅ
LUCAS INN
ASK UT
+00:17 over tiden

[ BYTTET ER GJORT ]
[ BEREGN PÅ NYTT ]
```

The main confirm button should remain stable in position to reduce mis-taps.

### Player cards

Each card displays:

- Name.
- `På banen` or `Benk`.
- Current actual match playing time.
- Current stint or bench duration in smaller text.
- Availability indicator.

Use an icon/text combination, not only background color.

### Wake/audio status

Keep these small and non-blocking:

```text
Lyd klar
Skjermlås aktiv
```

If wake lock fails:

```text
Skjermen kan låses automatisk
Hold telefonen våken mens kampen pågår.
```

If audio is suspended:

```text
Trykk her for å aktivere lydvarsler igjen
```

## 8. Manual substitution flow

Keep it two-stage and large:

1. `Hvem skal ut?` — show on-field cards only.
2. `Hvem skal inn?` — show available bench cards only.
3. Summary:

```text
Lucas inn
Fredrik H ut

Registreres på 04:10
```

Buttons:

```text
[ REGISTRER BYTTE ]
[ Avbryt ]
```

If only one valid bench player exists, preselect them but still show the summary.

## 9. Pause and end

Pause sheet:

```text
Sett kampen på pause?
Spilletid og kampklokke stopper til du fortsetter.
```

Pause can be one tap if placed away from the substitution confirmation button. Resume is large.

End sheet before planned zero:

```text
Avslutte kampen nå?
Registrert kamptid: 10:42
```

At planned zero, the primary action is simply:

```text
AVSLUTT KAMP
```

Secondary:

```text
+30 sek
Egendefinert ekstratid
```

## 10. Recovery screen

When opening a running journal:

```text
En kamp var i gang
Sist lagret: 11:06:14
Beregnet kamptid nå: 06:18

På banen:
Ask, Ali, Lucas

[ FORTSETT KAMP ]
[ GJENNOMGÅ TID ]
```

If the wall-clock jump is suspicious:

```text
Klokka kan ha endret seg
Velg riktig kamptid før du fortsetter.
```

Provide a large time adjustment control and preserve an audit/recovery event.

## 11. Match summary

Top:

```text
Kampen er ferdig
12:00 · mot Reinen Hvit
```

Table/cards:

```text
Ask        09:00   mål 09:00   ±0:00
Ali        09:00   mål 09:00   ±0:00
Fredrik H  09:00   mål 09:00   ±0:00
Lucas      09:00   mål 09:00   ±0:00
```

Timeline:

```text
00:00  Ask · Ali · Fredrik H
03:00  Lucas inn · Ask ut
06:00  Ask inn · Ali ut
09:00  Ali inn · Fredrik H ut
12:00  Slutt
```

Actions:

- `Neste kamp`
- `Se hendelser`
- `Rett opp`
- `Eksporter`

## 12. Accessibility

- Semantic buttons and headings.
- `aria-live="assertive"` only for the due substitution and match-end alert; avoid constant timer announcements.
- Timer gets a descriptive label but does not announce every second.
- Focus moves to the due substitution heading when appropriate without stealing focus repeatedly.
- All controls usable by keyboard.
- Visible focus.
- Sufficient contrast.
- Text remains usable at 200% zoom.
- Do not use rapid flashing. A visual pulse must remain below harmful flash frequency and respect reduced motion.
- Error messages identify the affected field.
- Color is supplementary.
- Names are never truncated without an accessible full label.

## 13. Responsive details

- Use CSS container/media queries as appropriate.
- For short screens, reduce secondary stats before shrinking the main timer or confirm button.
- Landscape may place timer/recommendation left and player cards right.
- Support iPhone safe areas.
- Avoid controls behind the browser/home indicator.
- Test at common widths around 320, 375, 390, 430, and a landscape height near 390.

<!-- END UX_AND_COPY.md -->


---

<!-- BEGIN TEST_AND_ACCEPTANCE.md -->

# Test and Acceptance Plan

## 1. Test philosophy

The highest-risk areas are timekeeping, event replay, fairness math, adaptive planning, persistence, and live-action correctness. Test those as pure logic before testing UI.

Do not use real time in unit tests. Inject fake monotonic and wall clocks. Do not assert only snapshots for domain behavior; assert exact times, lineups, balances, and event sequences.

## 2. Unit tests

### 2.1 Clock

Required cases:

- Start at zero.
- Elapsed derives from monotonic time.
- A delayed render callback does not create drift.
- `requestAnimationFrame` stopping does not change truth; the next read catches up.
- Pause freezes elapsed.
- Resume continues from accumulated active time.
- Multiple pause/resume cycles.
- Planned zero clamps elapsed.
- Explicit overtime extends the clamp.
- Wall clock moving while the page remains alive does not affect monotonic elapsed.
- Reload recovery uses the persisted wall snapshot.
- Negative wall delta is handled safely and flagged.
- Implausibly large wall delta opens recovery review.
- Visibility return re-anchors the monotonic source.
- Alert lead threshold fires once.
- Due threshold fires once.
- Match-end threshold fires once.
- Skipping thresholds while hidden produces one consolidated alert.
- Clock serialization/deserialization round trip.

### 2.2 Event projection

Required cases:

- Start lineup accrues actual time correctly.
- Equal ideal accrual for four available players and three slots.
- Substitution splits intervals exactly.
- Batch substitution.
- Pause does not add active elapsed.
- Temporary availability change alters ideal accrual.
- Unavailable player receives no ideal time.
- Lineup synchronization.
- Match end.
- Overtime duration change.
- Event ordering by elapsed and sequence.
- Voided event ignored.
- Replacement event applied.
- Invalid outgoing player produces an issue.
- Duplicate lineup player produces an issue.
- Total actual player time equals field slots × active duration when the lineup is valid and full.
- Sum of ideal player time equals field slots × active duration when enough players are available.
- Stint and bench interval derivation.
- Reprojection is deterministic.

### 2.3 Allocator

Required cases:

- Equal balances.
- Highly unequal balances.
- A player capped at all remaining time.
- A player allocated zero.
- Exact integer capacity preservation.
- Bounds.
- Stable rounding tie-break.
- Randomized/property tests across valid `n`, `K`, `R`, and balance values.
- Match-only versus tournament starting balances.

### 2.4 Planner

Required scenarios from `FAIR_PLAY_ENGINE.md`, including:

- Four/three/twelve exact 3:00 rotation.
- Five/three/twelve exact 7:12 target.
- Six/three/twelve exact 6:00 target.
- No bench.
- Late confirmation.
- Early confirmation.
- Manual alternative substitution.
- Availability loss and return.
- Carried balance into next match.
- Immediate recommendation.
- Near-end micro-stint suppression.
- Forced fairness-critical short stint.
- Batch forced swap.
- Stable deterministic tie-breaking.
- Every planned lineup is valid.
- Simulated actual total equals available field capacity.
- Planner never schedules after match end.

### 2.5 Storage and backup

- Create/read/update tournament.
- Atomic event plus journal transaction.
- Simulated transaction failure does not update visible committed state.
- Active journal recovery.
- Schema migration.
- Full export/import round trip.
- Import-as-copy remaps all IDs and references.
- Invalid schema rejected without partial writes.
- Duplicate/conflicting import handled.
- Projections before export and after import are equal.

## 3. Component and integration tests

Required:

- Create tournament.
- Add/edit/reorder players.
- Add/edit matches.
- Select availability.
- Select exactly K starters.
- Load recommended starters.
- Start button creates match event.
- Live timer renders from clock state.
- Recommendation due UI.
- Confirm suggested substitution.
- Confirm manual substitution.
- Recalculate without substitution.
- Pause/resume.
- Mark player unavailable.
- Undo last action.
- End match.
- Summary displays exact totals.
- Save failure keeps action unconfirmed and shows error.
- Recovery prompt.
- Import seed data.
- Export action fallback.
- Wake lock unsupported state.
- Audio suspended state.
- Service-worker update deferred during live match.
- Bokmål strings on primary flow.

Use accessible queries where possible.

## 4. End-to-end tests

At minimum:

### Flow A — seed and normal match

1. Open clean app.
2. Import/load Krokelvdalen seed.
3. Open first match.
4. Select Ask, Ali, Fredrik H as starters.
5. Start match with a controllable/fake clock.
6. Advance to 03:00.
7. Confirm Lucas for Ask.
8. Advance and confirm the 06:00 and 09:00 recommendations.
9. End at 12:00.
10. Assert 09:00 each and the exact timeline.

### Flow B — delayed change and adaptive plan

1. Start the same lineup.
2. Advance to 03:27.
3. Confirm Lucas for Ask.
4. Assert actual event time is 03:27.
5. Assert the planner does not claim perfect current-match equality.
6. Complete the match following recommendations.
7. Assert the balance carries to match two.

### Flow C — reload recovery

1. Start a match.
2. Advance.
3. Reload or recreate app state with persisted journal.
4. Advance wall clock during the gap.
5. Recover.
6. Assert elapsed and lineup.
7. Confirm a substitution.
8. End and review.

### Flow D — offline

1. Load app online once.
2. Confirm service worker readiness.
3. Disable network.
4. Reload/open app shell.
5. Open local tournament.
6. Start and complete a match.
7. Export backup through the fallback path.

### Flow E — manual deviation

1. Start match.
2. Record a different outgoing player than recommended.
3. Assert real lineup.
4. Assert next recommendation recalculates.
5. Undo and assert projection returns.

If browser automation cannot emulate installed iOS PWA behavior, keep these web E2E tests and add the manual checklist below.

## 5. Manual iPhone acceptance checklist

Test on a physical current iPhone when available. Record the exact iOS/Safari version.

- Add the site to the Home Screen.
- Launch in standalone mode.
- Confirm safe-area layout.
- Confirm no primary live control requires scrolling in the four-player case.
- Confirm timer digits are readable in portrait and landscape.
- Confirm touch targets are reliable with one hand.
- Confirm first load, install, then airplane-mode relaunch.
- Confirm local data remains after closing and reopening.
- Start a match and verify audio initialization.
- Test with the silent switch and document behavior; visual alert must remain sufficient.
- Verify the wake-lock status indicator.
- Let the screen sit during a match; document whether it remains awake.
- Background the app for approximately 20 seconds while the real match should continue.
- Return and confirm the displayed elapsed time catches up.
- Lock/unlock the phone and review recovery.
- Trigger a phone call or notification interruption if practical.
- Confirm a due recommendation after returning from background.
- Reload during a running match.
- Pause, background, return, and confirm paused time did not advance.
- Confirm vibration is treated as optional.
- Deny or fail wake lock and ensure the app remains usable.
- Complete match and inspect exact totals.
- Export backup through Share or download.
- Clear site/app data, reinstall, and import backup.
- Publish an updated build during a live match and verify no forced reload.
- Test daylight and dark appearance.
- Test text enlargement and VoiceOver enough to verify core controls.

Never claim this checklist passed without physical testing.

## 6. Performance acceptance

- Initial production JavaScript should remain modest for a small app.
- No heavy charting library for simple timelines.
- No network request for fonts.
- Live timer updates should not cause the entire app to rerender every frame.
- Use a localized timer subscription/component.
- Domain planning should complete effectively instantly for normal rosters; establish a conservative budget such as under 50 ms for up to ten players on a normal phone.
- IndexedDB writes occur on events and a modest recovery heartbeat, not every animation frame.
- No memory growth from unbounded timer callbacks or audio nodes.
- Production build has no obvious console errors.

## 7. Security and privacy acceptance

- No analytics or telemetry.
- No child data sent off-device.
- No third-party runtime script.
- Import uses strict validation.
- Export escapes/serializes safely.
- User-supplied names render as text, never HTML.
- Service worker only caches intended same-origin assets.
- No secrets are required.
- Dependency audit reviewed and material issues documented.
- Content Security Policy guidance included in deployment docs where static host permits.

## 8. Definition of done

The product is done only when:

- All essential workflows are implemented.
- Strict typecheck passes.
- Lint passes.
- Unit and integration tests pass.
- Production build passes.
- E2E suite passes or a precise environment limitation is documented.
- Core domain coverage includes the required scenarios.
- Seed tournament works.
- Offline shell works.
- Import/export works.
- Reload recovery works.
- Live updates do not drift from callback delay.
- Event history reproduces exact lineup intervals.
- Adaptive recommendations use actual confirmed times.
- No core feature relies on wake lock, vibration, background execution, or notifications.
- Repository documentation is complete.
- No placeholder implementation remains.

<!-- END TEST_AND_ACCEPTANCE.md -->


---

<!-- BEGIN PLATFORM_NOTES.md -->

# Platform Notes — Browser Constraints

These notes are product constraints, not optional polish. They were checked against current WebKit/Apple and MDN material in August 2026. The implementation must still use runtime capability detection because browser support and regressions can vary by exact OS release and install mode.

## 1. Foreground timing versus background execution

Browsers may throttle ordinary timers in hidden/background pages, and animation-frame callbacks generally stop while a page is hidden.

Consequences:

- Never accumulate match time by counting timer callbacks.
- Derive elapsed time from a monotonic clock while alive.
- On foreground return, calculate the current state from persisted anchors and actual current time.
- A due substitution alert cannot be guaranteed while the iPhone web app is backgrounded or locked.
- The product must tell the user that the live app should remain visible during the match.

## 2. Screen Wake Lock

Screen Wake Lock is useful but cannot be treated as guaranteed:

- It requires a secure context.
- It may be released by the browser or operating system.
- It may fail in low-power or other conditions.
- Home Screen web-app behavior has changed across iOS versions and has had regressions.

Consequences:

- Feature-detect.
- Request from a user gesture.
- Listen for release.
- Re-request on visibility return.
- Show a visible status.
- Gracefully instruct the coach to keep the screen awake manually when unavailable.
- Do not use a hidden-video workaround.

## 3. Audio

Audible playback may require a user gesture, and an audio context can be suspended when an iOS web app is backgrounded.

Consequences:

- Initialize/resume audio from `Start match` or `Test sound`.
- On return, detect a suspended context and request a tap.
- Generate short local cues; no network asset dependency.
- Always pair sound with a strong visual alert.
- Never claim that sound will fire while the app is suspended.

## 4. Vibration and haptics

Do not depend on web vibration or native haptics on iPhone.

Consequences:

- Feature-detect `navigator.vibrate`.
- Call it opportunistically.
- Treat a missing API or rejected behavior as normal.
- Audio and visual state are the primary notification channels.

## 5. Local storage

IndexedDB is appropriate for structured local data, and browsers expose storage persistence APIs. Local browser data is nevertheless not an absolute backup: users can clear it, the system can experience storage pressure, and browser bugs are possible.

Consequences:

- Use IndexedDB with transactions and migrations.
- Request persistent storage when available.
- Provide versioned export/import.
- Encourage backup after the tournament.
- Never market local storage as impossible to lose.

## 6. PWA updates

A service worker can deliver an offline application shell, but a newly activated worker can cause version mismatch or reload behavior if implemented carelessly.

Consequences:

- Prompt for updates.
- Defer activation/reload during a running or paused match.
- Persist before activation.
- Keep old and new schemas migration-safe.
- Test an update arriving mid-match.

## 7. Static hosting

Wake lock, service workers, storage APIs, and installability generally require HTTPS, apart from localhost development.

Consequences:

- Produce a static build deployable to an HTTPS host.
- Document at least one static deployment route.
- Keep all runtime assets same-origin and local to the build.

<!-- END PLATFORM_NOTES.md -->


---

<!-- BEGIN DELIVERY_CHECKLIST.md -->

# Delivery Checklist

## Repository and tooling

- [ ] Initialize or inspect the repository.
- [ ] Use latest stable React, TypeScript, Vite, and supporting packages.
- [ ] Commit a lockfile.
- [ ] Enable strict TypeScript.
- [ ] Configure linting and deterministic formatting.
- [ ] Add scripts for development, typecheck, lint, tests, E2E, build, and preview.
- [ ] Keep runtime assets local.

## Domain

- [ ] Define versioned persisted types.
- [ ] Implement immutable/audited match events.
- [ ] Implement deterministic event ordering.
- [ ] Implement lineup and availability projection.
- [ ] Derive actual playing time.
- [ ] Derive availability-adjusted ideal time.
- [ ] Derive fairness balances.
- [ ] Derive playing and bench stints.
- [ ] Detect invalid event streams.

## Clock

- [ ] Inject monotonic and wall clock sources.
- [ ] Use monotonic elapsed while the page is alive.
- [ ] Implement pause/resume.
- [ ] Implement planned-end clamp and overtime.
- [ ] Implement alert threshold crossing.
- [ ] Implement active journal and recovery.
- [ ] Persist on events, visibility/pagehide, and a modest heartbeat.
- [ ] Show clock anomaly review when necessary.
- [ ] Never decrement a counter as truth.

## Fairness planner

- [ ] Implement exact-capacity integer water filling.
- [ ] Implement normal cyclic rotation.
- [ ] Implement adaptive replan from actual state.
- [ ] Implement deterministic tie-breaking.
- [ ] Respect availability.
- [ ] Carry tournament balance.
- [ ] Include soft stint/substitution constraints.
- [ ] Expose plan diagnostics.
- [ ] Pass all required fairness scenarios.

## Storage

- [ ] Create Dexie database and indexes.
- [ ] Add migrations.
- [ ] Use atomic command transactions.
- [ ] Implement import validation.
- [ ] Implement export.
- [ ] Implement import-as-copy ID remapping.
- [ ] Implement active-match journal.
- [ ] Request persistent storage progressively.
- [ ] Show save status.

## UI

- [ ] Home and active-match recovery.
- [ ] Tournament creation/edit.
- [ ] Roster management.
- [ ] Match schedule management.
- [ ] Availability and starter selection.
- [ ] Live timer.
- [ ] Next substitution countdown.
- [ ] Due/overdue state.
- [ ] Confirm suggested substitution.
- [ ] Manual substitution.
- [ ] Recalculate without substitution.
- [ ] Availability change.
- [ ] Pause/resume.
- [ ] End/overtime.
- [ ] Undo/correction.
- [ ] Match summary and timeline.
- [ ] Tournament summary.
- [ ] Settings/data controls.
- [ ] Bokmål primary copy.
- [ ] High-contrast, safe-area, large-target mobile design.
- [ ] Accessible semantics and non-color cues.

## Platform

- [ ] PWA manifest and icons.
- [ ] Offline app shell.
- [ ] Prompt/deferred service-worker updates.
- [ ] Wake-lock adapter and status.
- [ ] Audio initialization and resumed-context prompt.
- [ ] Optional vibration.
- [ ] Visibility/background recovery.
- [ ] Share/download backup fallback.
- [ ] iPhone Home Screen installation documentation.
- [ ] No hidden wake-lock hacks.
- [ ] No claim of background alarms.

## Sample data

- [ ] Include `seed-krokelvdalen-2.json`.
- [ ] Validate it through the same import schema.
- [ ] Make it loadable/importable from the UI.
- [ ] Verify the four matches and four players.
- [ ] Verify 3-on-field, 12-minute defaults.

## Tests

- [ ] Clock unit tests.
- [ ] Projection unit tests.
- [ ] Allocator property tests.
- [ ] Planner scenario tests.
- [ ] Storage and migration tests.
- [ ] Import/export round-trip tests.
- [ ] Component/integration tests.
- [ ] E2E normal match.
- [ ] E2E delayed substitution.
- [ ] E2E reload recovery.
- [ ] E2E offline behavior.
- [ ] E2E manual deviation.
- [ ] Manual physical-iPhone checklist documented.

## Final gates

- [ ] Install succeeds.
- [ ] Typecheck passes.
- [ ] Lint passes.
- [ ] Unit/integration tests pass.
- [ ] Production build passes.
- [ ] E2E passes or exact environment blocker is documented.
- [ ] No runtime remote font/API/analytics request.
- [ ] No TODO or placeholder in core flow.
- [ ] README explains setup, deployment, install, backup, and limitations.
- [ ] Final implementation report is truthful.

<!-- END DELIVERY_CHECKLIST.md -->


---

## Embedded seed data

```json
{
  "format": "fairplay-sideline-seed",
  "schemaVersion": 1,
  "tournament": {
    "id": "tournament-krokelvdalen-2-2026-08-22",
    "name": "Spilldag 22. august 2026",
    "date": "2026-08-22",
    "timezone": "Europe/Oslo",
    "teamName": "Krokelvdalen 2",
    "coachLabel": "Michael",
    "defaultMatchDurationMs": 720000,
    "defaultPlayersOnField": 3,
    "defaultMinimumStintMs": 60000,
    "defaultAlertLeadMs": 10000,
    "fairnessScope": "tournament"
  },
  "players": [
    {
      "id": "player-ask",
      "name": "Ask",
      "sortOrder": 0,
      "active": true
    },
    {
      "id": "player-ali",
      "name": "Ali",
      "sortOrder": 1,
      "active": true
    },
    {
      "id": "player-fredrik-h",
      "name": "Fredrik H",
      "sortOrder": 2,
      "active": true
    },
    {
      "id": "player-lucas",
      "name": "Lucas",
      "sortOrder": 3,
      "active": true
    }
  ],
  "matches": [
    {
      "id": "match-1-reinen-hvit",
      "order": 0,
      "scheduledStartLocal": "2026-08-22T11:00:00",
      "opponent": "Reinen Hvit",
      "pitch": "2",
      "plannedDurationMs": 720000,
      "playersOnField": 3,
      "eligiblePlayerIds": [
        "player-ask",
        "player-ali",
        "player-fredrik-h",
        "player-lucas"
      ]
    },
    {
      "id": "match-2-tuil-3",
      "order": 1,
      "scheduledStartLocal": "2026-08-22T11:30:00",
      "opponent": "TUIL 3",
      "pitch": "2",
      "plannedDurationMs": 720000,
      "playersOnField": 3,
      "eligiblePlayerIds": [
        "player-ask",
        "player-ali",
        "player-fredrik-h",
        "player-lucas"
      ]
    },
    {
      "id": "match-3-tuil-4",
      "order": 2,
      "scheduledStartLocal": "2026-08-22T12:30:00",
      "opponent": "TUIL 4",
      "pitch": "2",
      "plannedDurationMs": 720000,
      "playersOnField": 3,
      "eligiblePlayerIds": [
        "player-ask",
        "player-ali",
        "player-fredrik-h",
        "player-lucas"
      ]
    },
    {
      "id": "match-4-reinen-bla",
      "order": 3,
      "scheduledStartLocal": "2026-08-22T13:00:00",
      "opponent": "Reinen Blå",
      "pitch": "3",
      "plannedDurationMs": 720000,
      "playersOnField": 3,
      "eligiblePlayerIds": [
        "player-ask",
        "player-ali",
        "player-fredrik-h",
        "player-lucas"
      ]
    }
  ],
  "suggestedFirstMatchStarters": [
    "player-ask",
    "player-ali",
    "player-fredrik-h"
  ]
}
```
