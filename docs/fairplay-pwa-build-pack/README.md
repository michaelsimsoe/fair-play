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
