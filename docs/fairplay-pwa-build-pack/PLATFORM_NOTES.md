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
