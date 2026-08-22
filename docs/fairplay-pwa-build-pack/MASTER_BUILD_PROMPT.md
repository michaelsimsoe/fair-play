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
