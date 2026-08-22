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
