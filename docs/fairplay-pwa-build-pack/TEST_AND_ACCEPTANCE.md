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
