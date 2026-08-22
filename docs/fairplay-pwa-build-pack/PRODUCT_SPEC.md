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
