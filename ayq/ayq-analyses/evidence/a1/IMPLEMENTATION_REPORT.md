# A1 implementation report

The report 007 §22 requires of the pull request. It lives here as well because
the repository's own rules keep the pull-request body at the blank template for
the person who tests the change to fill in; the same text is posted as a
comment on the pull request.

**Pull request:** [alxvpl/AYQ#1](https://github.com/alxvpl/AYQ/pull/1) — draft, unmerged.

**Status: the final correction set of 021 + 022 is applied — T3, PC1–PC9 and
the accepted icon — and the Windows evidence pass of 021 §5–§6 is complete
on the exact final candidate.** The thirteen installed-application images in
this directory were all taken from the one build of `37deeb7e4`, with their
capture record in `README.md`. Nothing is left for a further Windows pass.
Technical acceptance and product acceptance are the joint leads' to give.

## Revision record

| | |
|---|---|
| base (`claude/ayq-develop`, unchanged, nothing pushed to it) | `b1f0ede3f6e5fb821e4a1333d111fcfbf89a04f5` |
| head reviewed by 010 / 011 | `54469f13ee5fdfff843375fedef13d99bfa26562` |
| corrections P3, T1, T2.1–T2.5 | `6dbee8ef9` |
| two presentation defects of the first installed window | `885057628` |
| first thirteen images and their record | `5f0a52f8c` — head reviewed by 013 / 014 / 015 |
| **T3 and PC1–PC9** | `a37220c88` |
| **the accepted icon, and two defects seen only in the installed window of `a37220c88`** | `37deeb7e410fddadce7a146f27fe8f90afdfcff3` — **the head the final installer was built from** |
| this record and the thirteen images, recaptured in full | the commit that carries this file; it changes no source |
| `packages/` | untouched |

## Governing inputs, opened before editing

021 and 022 in full, in that order, as one directive; `AYQ_ANALYSES_A1_SPECIFICATION`
**r004** and the A1 presentation specification **r05**; 013, 014 and 015 as
021 cites them; the frozen r003 contract and its reference validator
`ayq_snapshot_validator-r003.py` for the exact shape of I14 in both
directions; the accepted artwork `AYQ_ANALYSES.png` as 022 identifies it, by
byte size and SHA-256, before any use. None was substituted by a repository
mirror, memory or an earlier handoff.

## The corrections, as applied

### T3 — provenance in both directions (`src/validate.ts`, `src/types.ts`)

`categorisation` is a required object on every transaction and `source` is
one of exactly `manual`, `rule`, `none`. `categoryId ≠ null` ⇒ `source` is
`manual` or `rule`, and `rule` ⇒ a non-empty `ruleKey`; `categoryId = null`
⇒ `source = none`. A null or missing `categorisation`, and provenance claimed
on an uncategorised row, are internal inconsistencies of the file and are
refused with the existing `invariant` reason — no new token, no new string.
`Transaction.categorisation` is non-nullable in the types and the detail
pane's three provenance mappings have no fallback left to take.

`test/fixtures/a1/build-fixtures.mjs` derives the source from the category,
never from the counterparty, and the fixtures are regenerated: twelve
`null` categorisations become `{source:'none'}` and the two salary rows
(`f01-t07`, `f03-t01`) drop their unfounded `rule` claim. No amount, key,
date or currency changes; `truth-manifest.json` is untouched and still
matches. `test/validate.test.ts` covers the refusal of `null`, of a missing
object, of `manual`/`rule`/`automatic` on an uncategorised row and of `none`
on a categorised row; the acceptance of `none` on an uncategorised row; and
that every intended-valid fixture still validates.

### PC1 — no application menu

`Menu.setApplicationMenu(null)` in `src/main.ts`, before the window is
created. `contextIsolation`, `sandbox`, the navigation guard and the preload
boundary are untouched; `test/boundary.test.ts` asserts both the call and
the baseline.

### PC2 — no Fluent default blue

`src/ui/theme.ts` builds the theme from Electric Mint through
`createLightTheme` with a mint brand ramp, then sets the filled primary
button to the dark ground with mint text. `test/theme.test.ts` proves that no
app-owned brand, link, focus or selection token is in the blue family (and
that the same check finds blue in Fluent's own light theme, so it bites), and
that the primary button tokens are dark ground / mint foreground.

### PC3 — a reversal's evidence names the original's positive money-out

`Contribution.original.moneyOutMinor` is supplied by the engine from the one
contribution function; `src/evidence.ts` prints it. No component takes an
absolute value or reads a raw bank sign. Screenshot 10 reads *Reverses
20 Jan 2026, €99.00, Superstore*; `test/evidence.test.ts` asserts the value
and the absence of a minus sign.

### PC4 — the reconciliation sentence shows the magnitude

`ReconciliationFact.differenceMagnitudeMinor` is supplied by the engine beside
the signed `differenceMinor` it keeps; the flyout formats the magnitude.
Screenshot 09 reads *Differs from the statement by €15.00*; regression case
24 and a flyout-line test in `test/engine.test.ts` cover both fields.

### PC5 — two composed literals into the catalogue

`coverage.flyout.reconciliation.line` (`{account} — {text}`) and
`context.accounts.entry` (`{name} · {identifier}`) enter `en.json`; the
components call the catalogue. The no-literal test in `test/boundary.test.ts`
now also catches a template literal or JSX string that joins values with a
separator. The chart tooltip prints the exact figure alone rather than a
`name: amount` sentence of its own (see observation 2).

### PC6 — preset trigger, duplicate range, draft/commit dates

`presetMatching` (`src/dates.ts`) names the preset whose dates these are from
the dates alone, so the trigger reads *Last month* until a date is edited and
*Custom…* after. The second copy of the range beside the dates, and its
catalogue key `context.period.range`, are gone. The date inputs edit a draft
and commit on blur or Enter through `commitPeriodDate` (`src/context.ts`): a
valid date becomes the context's, a crossing moves the other bound to the
same date, and an empty or invalid draft restores the last committed value.
`test/dates.test.ts` covers the preset match and every commit rule.

### PC7 — the coverage indicator

An outline `Button` with a trailing chevron. For a limited result only the
` · limited` suffix of the catalogue string takes the attention tone; the date
stays in the ordinary foreground. Nothing is composed outside the catalogue:
the suffix is the part of the limited string that the full string does not
have.

### PC8 — the detail pane

520 px wide, five columns separated by the control gap, the amount column
right-aligned in tabular figures, text wrapping inside its column. The date
and amount tracks are fixed so the header and every row share one set of
column edges (the second of the two defects below).

### PC9 — the sort arrow

`.sort-direction { color: inherit }` — the arrow is the column header's own
ink.

### The accepted icon

`build/AYQ_ANALYSES.png` is the artwork 022 identifies (1254 × 1254 RGB,
967 192 bytes, SHA-256 `3f2b6a7705a56bdb93752354fc01f05cde4a5b5eca6e167ca69ca7c4166037dc`).
`build/make-icon.ps1` refuses any source whose hash differs, then does only
what Electron and NSIS need: resizes to 16, 24, 32, 48, 64, 128 and 256 px
(high-quality bicubic, opaque 24-bit surfaces, no transparency added) and
packs them as PNG entries into `build/icon.ico` (79 017 bytes, SHA-256
`00ff61685b0855376395128f9fa1ca3f473262372f10b058844a3b2bab473c1b`). No
gradient, recolour, redraw or restyle. `package.json` points
`build.win.icon` at it; the package's `.gitignore` un-ignores `build/`
(the repository root ignores that name for build output). The installed
executable, the window's title bar and the taskbar show the mark; every image
in this directory shows it in the title bar.

## Two defects seen only in the installed window of `a37220c88`, fixed at `37deeb7e4`

Neither is a semantic change. Both were found during the smoke pass of the
first candidate of this set, before any image was kept; the set was then
recaptured in full from the build of the fix:

1. **The coverage button lost the space before `· limited`.** The button's
   content is a flex layout, so the date text and the marker span became
   separate items and the leading space of the span collapsed. The label is
   now one inline run with its whitespace preserved (`src/ui/coverage.tsx`,
   `src/styles.css`).
2. **The detail pane's columns were sized per row.** Each row was its own
   grid with `max-content` tracks, so the header and the rows did not share
   column edges (visible in 10 and 11 of the first candidate). The date and
   amount tracks are now fixed (`6em` each); the three text columns split
   the rest (`src/styles.css`).

## Commands run on Windows, and their results

Windows 11 Pro 10.0.26200 x64 (`process.platform` = `win32`), Node v24.21.0,
npm 11.19.0, from `ayq/ayq-analyses`, at `37deeb7e4`:

| command | result |
|---|---|
| `npm test` | **pass — 94 tests, 94 pass, 0 fail** (84 at 885057628 + 10 new: T3 ×2, theme ×4, PC4 flyout line, PC5 composition scan, PC6 preset match, PC6 date commit) |
| `npm run typecheck` | **pass** |
| `npm run build` | **pass** |
| `npm run package` | **pass** — `release/AYQ Analyses-0.1.0-windows-x64-setup.exe`, 139 212 955 bytes, SHA-256 `8A31A45704D6BBDBA337E7B339C31E4179DF56A277FD8CBFB263E9F07877A38E` (unsigned; no certificate is configured) |
| install (`setup.exe /S`) | **exit 0** — `%LOCALAPPDATA%\Programs\ayq-analyses\`, over the previous candidate; installed `app.asar` SHA-256 `B2D9493E28A196CF3EE7A9A71680E7C2FEC877EAB637A99956C5030535C94D97`, identical to the packaged one |
| installed-app smoke pass | **done** — all six states of r004 §5 reached on the installed executable with synthetic fixtures only: Result, Coverage-limited, Empty, Insufficient, Comparison unavailable, Unsupported; plus the invalid-snapshot refusal, the coverage flyout, the reversal drill-down, the exclusion evidence list, the exact-zero comparison with the dates typed digit by digit, the crossing and invalid-draft rules of PC6c, and the not-in-this-version destination |
| thirteen screenshots | **captured from this one build** — see `README.md` for the method per image |

Environment notes, none a repository change: the repository's agent hooks
require `jq`, installed on this machine for the session; electron-builder's
`winCodeSign` archive contains macOS symlinks this user account cannot
create, so it was extracted into electron-builder's cache without the
`darwin` entries; the accepted artwork was supplied at the user's Downloads
folder (redirected to another drive on this machine) and copied into
`build/` after its hash was verified.

## Fixtures

Under `test/fixtures/a1/`: the nine valid snapshots, the one intentionally
invalid one, `truth-manifest.json` (hand-authored, unchanged) and
`build-fixtures.mjs`. Four fixtures were regenerated for T3 as described
above; every valid fixture passes the validator with T2.1–T2.5 and T3 in
force, and the invalid one is still refused for its broken reversal.

## Screenshots

All thirteen `.png` files named in `README.md` are present, each the real
window of the NSIS-installed build of `37deeb7e4` running on Windows,
captured by `PrintWindow` on the application's own window at its default
size. The directory is excluded from the packaged application.

## Out of scope — confirmed

- `packages/` is **unchanged** on this branch.
- No A2, A3 or A4 functionality was added; the boundary tests still fail if
  `expectationRecords`, `expectedOccurrences`, `categoryPlans`, `forecast` or
  `backtest` appears in the engine or the renderer.
- Files touched on this pass: `ayq/ayq-analyses/src/**`,
  `ayq/ayq-analyses/test/**`, `ayq/ayq-analyses/build/**`,
  `ayq/ayq-analyses/evidence/a1/**`, `ayq/ayq-analyses/package.json` (one
  line: the icon path) and `ayq/ayq-analyses/.gitignore`. The lockfile is
  unchanged.
- **No real banking or personally identifying financial data was used
  anywhere.** Every fixture, name, amount and identifier is invented; no real
  snapshot was opened on this machine.

## Observations returned, not decided

None blocks the pass. Each is stated so it is not silently absorbed.

1. **r004 against r05 — no divergence found.** Every behaviour the images
   show is stated the same way in both, and no correction of 021 §3
   contradicts either. Nothing in the frozen r003 contract, as read for T3,
   diverges from the canon on any input A1 uses.
2. **The chart tooltip now prints the exact figure alone.** Before PC5 it
   composed `name: amount` in the component; the catalogue has no key for
   that sentence and 021 named exactly two literals to move, so the tooltip
   was reduced to the formatted figure rather than a third key invented for
   it. The bar's own label already prints the same figure. If the joint leads
   want the counterparty name in the tooltip, it is one catalogue key.
3. **A Chromium date input's segment highlight is the control's own.** While
   a date segment is being typed, Chromium highlights the active segment with
   its native selection colour (blue), which is not an application token and
   is not reachable from the theme. No image contains it: each was taken with
   no control focused. Noted so a reviewer who types a date does not read the
   highlight as a surviving Fluent blue.
4. **GDI+ and the 256 px icon entry.** The `.ico` is packed with PNG entries,
   as Electron and NSIS accept. Windows Explorer, the taskbar and the window
   frame draw every size; the legacy GDI+ `Icon` API, when asked for 256 px,
   falls back to the 128 px entry. Nothing in the product or its tooling uses
   that API; noted only because it can surprise a manual inspection with
   PowerShell.
5. **The detail pane's fixed date and amount tracks are `6em` at 12 px.** A
   locale whose formatted date or amount is wider than that would wrap inside
   the column rather than collide; the English catalogue and the euro
   formatter fit with room. A shared-track grid (CSS subgrid) would keep
   `max-content` sizing and is the alternative if a wider locale arrives.

## Status

The pull request is a **draft and unmerged**, and the implementation engineer
does not merge it. Nothing was pushed to `claude/ayq-develop`; no history was
rewritten; no branch was force-pushed, deleted, renamed or created. This
branch was pushed to its own remote ref only.
