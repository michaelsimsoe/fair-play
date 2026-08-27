# FairPlay Sideline

FairPlay is a private, offline-first Progressive Web App for managing approximately
equal playing time during short children's football matches. It records what
actually happened, derives every player's time from an auditable event stream, and
recalculates the remaining substitution plan after delays or manual changes.

Reusable guest players share the target in each selected match without affecting
the team's tournament balance. Manual substitutions start directly from an
on-field player card, and projected differences within 30 seconds are shown
without forcing disruptive catch-up stints.

The interface is Norwegian Bokmål. The implementation and tests are English.

## Run locally

Requires Node.js 22 or newer.

```powershell
npm install
npm run dev
```

Open the URL printed by Vite. To test the production service worker:

```powershell
npm run build
npm run preview
```

## Quality commands

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
npx playwright install chromium
npm run test:e2e
```

The Vitest suite covers the monotonic clock, recovery anomalies, event projection,
fairness accounting, exact integer allocation, adaptive planning, IndexedDB
transactions/migration, backup round trips, seed validation, and the central setup
flow. Playwright covers normal and delayed matches, reload/pause recovery, manual
deviation with undo, and offline operation.

## Architecture

- `src/domain/` contains pure deterministic events, projection, fairness,
  allocation, and planning. It has no React, browser, or storage dependency.
- `src/clock/` derives active elapsed time from an injected monotonic source and
  uses wall time only for explicit reload recovery.
- `src/storage/` validates persisted/imported boundaries with Zod and stores
  versioned records in transactional Dexie/IndexedDB tables.
- `src/platform/` capability-detects wake lock, Web Audio, vibration, file sharing,
  install mode, visibility, and persistent storage.
- `src/features/` contains setup, live-match, summary, and local data workflows.

Recommendations are advisory. Only confirmed or manually recorded events change
the lineup or playing-time ledger. Actual and ideal totals are always reprojected
from history rather than maintained as mutable counters.

## Sample data

Choose **Last inn eksempel** on the empty home screen to load the bundled
Krokelvdalen 2 tournament. It contains four players, four 12-minute matches, and
three field slots. The sample passes through the same validation and import path as
other seed files and can be archived or deleted.

## Backups and privacy

All child names and match records stay in IndexedDB on the current device. There
is no account, server, analytics, telemetry, remote font, or runtime API.

Use **Innstillinger og data → Eksporter sikkerhetskopi** to share or download a
versioned JSON backup. Imports can create a fully ID-remapped copy; full restore is
available behind a destructive confirmation. Browser storage can still be cleared
by the user or operating system, so exported files are the durable backup.

## Install on iPhone

1. Open the deployed HTTPS site in Safari.
2. Tap **Del**.
3. Choose **Legg til på Hjem-skjermen**.
4. Launch FairPlay from its icon once while online; subsequent launches use the
   cached app shell.

Keep the app visible during a match. iOS may release Screen Wake Lock, suspend
audio, throttle background pages, or lock the device. FairPlay catches elapsed time
up from clock anchors when foregrounded, but a web app cannot guarantee audible
alerts while hidden or locked. Visual state is always authoritative; vibration and
wake lock are optional enhancements.

The physical-iPhone acceptance checklist is in
`docs/fairplay-pwa-build-pack/TEST_AND_ACCEPTANCE.md`. No physical iPhone result is
claimed by automated tests.

## Static deployment

`npm run build` emits a self-contained `dist/` folder. Set `BASE_URL` when
deploying below a path:

```powershell
$env:BASE_URL = "/fair-play/"
npm run build
```

The included GitHub Actions workflow validates and deploys `main` to GitHub Pages.
For another static host, serve `dist/` over HTTPS and route navigation requests to
`index.html`. A host-level Content Security Policy can use this baseline, adjusted
for Vite's emitted assets and the generated service worker:

```text
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:;
connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none';
base-uri 'self'; form-action 'self'
```

No service-worker update forces a reload during a running or paused match. Updates
remain deferred until the live screen has been left.

## App artwork

`assets/fair-play-icon.png` is the repository-owned master artwork. `npm run icons`
derives transparent browser favicons, opaque iOS/PWA install icons, and a dedicated
maskable icon with a safe crop zone, plus correctly sized portrait and landscape
launch screens for common iPhones. Other platforms use the manifest icon and
`background_color` when generating their launch splash.
