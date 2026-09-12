# FairPlay Domain

FairPlay records real match participation and helps a coach distribute playing time fairly across a match day.

## Language

**Team player**:
A player who belongs to the coached team. Their fairness balance can carry between matches when they are available.
_Avoid_: Actual player, permanent player, regular player

**Guest player**:
A player borrowed from another team and registered for the match day, then selected per match. They share the match target equally while participating, but do not carry a fairness balance between matches or appear in team fairness totals.
_Avoid_: Loan player, substitute player, borrowed slot

**Match availability**:
Whether a team or guest player can participate during a match interval. An unavailable player accrues no playing-time target for that interval.
_Avoid_: Eligibility, attendance

**Participation pause**:
An explicit period during which a player should not participate because of injury, recovery, or another practical reason. It may last for the rest of the current match, through the next match, or for the rest of the match day; paused time accrues no playing-time target.
_Avoid_: Injury status, suspension, absence debt

**Balance treatment**:
The coach's explicit choice when starting a participation pause: preserve the player's existing tournament difference for gradual compensation after return, or waive it so recovery starts from neutral.
_Avoid_: Penalty, forgiveness

**Gradual compensation**:
Recovery of a preserved tournament difference after a participation pause, capped at one minute above the player's normal match target per match.
_Avoid_: Catch-up match, full-match compensation

**Match target**:
The availability-adjusted playing-time share for a single match. It includes every available team and guest player, remains stable through substitutions and delays, and changes only when match availability explicitly changes.
_Avoid_: Quota, guaranteed minutes

**Tournament balance**:
A team player's cumulative actual playing time minus their cumulative target across the match day. It is carried forward so later matches can compensate for earlier differences.
_Avoid_: Score, ranking, performance

**Manual substitution**:
A coach-initiated exchange that starts from the actual on-field lineup. It becomes match history only when confirmed; the outgoing player remains available unless the coach explicitly holds them out.
_Avoid_: Override, forced substitution

**Recommendation**:
An advisory future exchange calculated from the actual match history and current fairness balances. It never changes the lineup until confirmed.
_Avoid_: Scheduled substitution, automatic substitution

**Projected difference**:
The expected difference between a player's actual time and match target if the current recommendation plan is followed.
_Avoid_: Error, failure

**Compensation tolerance**:
A small acceptable projected difference that should not trigger an otherwise unnecessary short stint. The current tolerance is 30 seconds; unresolved team-player differences carry into later matches.
_Avoid_: Grace period, ignored time

**Bench rest**:
An uninterrupted interval during which an available player is off the field. Its preferred length is 60 seconds, independent of the on-field stint setting, and prevents an ordinary manual substitution from immediately cycling the same player back in.
_Avoid_: Penalty, timeout
