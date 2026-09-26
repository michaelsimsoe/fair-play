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

**Substitution rhythm**:
The fixed grid of automatic recommendation times on the match clock, such as every two minutes at 02:00, 04:00, 06:00, and so on. A delayed confirmation does not move later boundaries, and fairness never creates an automatic off-grid substitution.
_Avoid_: Stint length, countdown reset

**Taken slot**:
A rhythm boundary already used by a change made in the second half of the interval before it — an early confirmation, or a manual substitution that brings in the child planned to come in next. The next recommendation moves to the following boundary, and the child who was planned out stays on until then.
_Avoid_: Skipped substitution, reset

**Settling-in**:
A child who came on less than one substitution-rhythm interval ago is still settling in and is not recommended off at the next boundary; a child who just went off is likewise not the first choice to come straight back on. Settling-in may cost a small fairness imbalance rather than break the cadence.
_Avoid_: Protected player, lock

**Welfare change**:
A coach-initiated substitution outside the fixed rhythm because a child is injured, tired, upset, or otherwise needs attention. It may happen at any time and causes only future player assignments to adapt.
_Avoid_: Fairness correction, emergency optimization

**Wait**:
A temporary acknowledgement that a due recommendation cannot happen safely yet. It quiets the alert without recording a substitution or changing the intended pair.
_Avoid_: Skip, confirm later

**Projected difference**:
The expected difference between a player's actual time and match target if the current recommendation plan is followed.
_Avoid_: Error, failure

**Compensation tolerance**:
A small acceptable projected difference that should not trigger an otherwise unnecessary short stint. The current tolerance is 30 seconds; unresolved team-player differences carry into later matches.
_Avoid_: Grace period, ignored time

**Fairness band**:
The acceptable spread of whole substitution intervals among available players. A one-interval difference is normal and preferable to irregular or disruptive substitutions.
_Avoid_: Exact equality, perfect leveling

**Bench rest**:
An uninterrupted interval during which an available player is off the field. Its preferred length is 60 seconds, independent of the on-field stint setting, and prevents an ordinary manual substitution from immediately cycling the same player back in.
_Avoid_: Penalty, timeout

**Game format**:
The number of players and structural rules used on the field, such as 3-a-side, 5-a-side, or 7-a-side. It determines which formation templates are available but does not define a specific lineup.
_Avoid_: Formation, team size

**Formation**:
A named arrangement of on-field role slots, such as 1-2-1 in 5-a-side. It describes the shape of the team, not which players occupy it.
_Avoid_: Lineup, player list

**Role slot**:
One place in a formation with a stable responsibility and position family, such as goalkeeper, left defender, or striker. A lineup assigns one player to every occupied role slot.
_Avoid_: Player position, shirt number

**Position exposure**:
A player's accumulated participation in a position family during a match or match day. It is a secondary rotation goal after player welfare, valid lineups, and reasonable playing time.
_Avoid_: Position rating, positional entitlement

**Goalkeeper policy**:
The coach's rule for goalkeeper participation: one goalkeeper for the match, rotation between matches, or rotation at selected match-clock boundaries. Only willing or eligible players may be assigned.
_Avoid_: Formation
