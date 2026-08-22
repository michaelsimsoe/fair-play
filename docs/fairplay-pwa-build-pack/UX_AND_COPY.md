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

| English concept        | Bokmål UI                   |
| ---------------------- | --------------------------- |
| Tournament / match day | Spilldag                    |
| Team                   | Lag                         |
| Players                | Spillere                    |
| Matches                | Kamper                      |
| Pitch                  | Bane                        |
| Match duration         | Kamplengde                  |
| Players on field       | Spillere på banen           |
| Available              | Tilgjengelig                |
| Unavailable            | Ikke tilgjengelig           |
| Starting lineup        | Startoppstilling            |
| Bench                  | Benk                        |
| On field               | På banen                    |
| Start match            | Start kamp                  |
| Pause                  | Pause                       |
| Resume                 | Fortsett                    |
| End match              | Avslutt kamp                |
| Match remaining        | Igjen av kampen             |
| Next change            | Neste bytte                 |
| Change in              | Bytte om                    |
| Change now             | BYTT NÅ                     |
| Incoming               | inn                         |
| Outgoing               | ut                          |
| Confirm change         | Byttet er gjort             |
| Do it now              | Bytt nå                     |
| Manual change          | Manuelt bytte               |
| Recalculate now        | Beregn på nytt              |
| Undo last action       | Angre siste handling        |
| Saved                  | Lagret                      |
| Saving                 | Lagrer …                    |
| Save failed            | Lagring feilet              |
| Sound ready            | Lyd klar                    |
| Tap for sound          | Trykk for lyd               |
| Screen awake           | Skjermen holdes våken       |
| Wake lock unavailable  | Hold skjermen våken manuelt |
| Match finished         | Kampen er ferdig            |
| Overtime               | Ekstratid                   |
| Playing time           | Spilletid                   |
| Ideal time             | Måltid                      |
| Difference             | Avvik                       |
| Event log              | Hendelser                   |
| Export backup          | Eksporter sikkerhetskopi    |
| Import backup          | Importer sikkerhetskopi     |
| Offline ready          | Klar uten nett              |

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
