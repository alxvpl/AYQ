# A1 implementation report

The report 007 §22 requires of the pull request. It lives here as well because
the repository's own rules keep the pull-request body at the blank template for
the person who tests the change to fill in; the same text is posted as the first
comment on the pull request.

**Pull request:** [alxvpl/AYQ#1](https://github.com/alxvpl/AYQ/pull/1) — draft, unmerged.

**A1 is returned early, with one blocker: the thirteen installed-Windows
screenshots do not exist.** See *Blocker*.

## Start-of-work record

| | |
|---|---|
| base / start SHA (`claude/ayq-develop`, live at start and unchanged at push) | `b1f0ede3f6e5fb821e4a1333d111fcfbf89a04f5` |
| this branch HEAD at the time of this report | `1d9a0ba8357cff4fc7cf92d73b4a208f82d1b76d` |
| old `claude/ayq-analyses-bootstrap` (reference/source only, not merged) | `531d38d4d12f54e033d56fabb4c1e0c3f2580760` |
| relationship of those two | diverged, 14 ahead / 9 behind |
| merge base | `716eb181cb1d3ad71e60f096f829ce40a131e635` |
| working tree at start | clean; no unrelated local work existed |

All three figures match 009 §8 exactly; re-verification found no drift.

## Governing inputs A–I, all opened before editing

007 §2 as modified by 009 §6 (D5) and 009 §7 (D6).

| | input | revision as read |
|---|---|---|
| A | `AYQ_PROJECT_WORK_INSTRUCTIONS` | ACCEPTED |
| B | AYQ `00_INDEX.md` | r009, 2026-09-20, CURRENT |
| C | `02_ARCHITECTURE` / `03_DATA` / `04_DESIGN` / `06_RELEASE` | r005 / r015 / r006 / r003, all CURRENT |
| D | `AYQ_ANALYSES_COLLABORATION_MODEL` | ACCEPTED |
| E | `AYQ_ANALYSES_PROJECT_WORK_INSTRUCTIONS` | ACCEPTED |
| F | `AYQ_ANALYSES_A1_SPECIFICATION` | **r003, ACCEPTED** |
| G | `A1_PRESENTATION__r03` | r03, accepted by 006 |
| H | 004 — fixture/screenshot/branch/evidence plan | as published |
| I | 006 — conformity acceptance and interpretations | as published |

None was substituted by a repository mirror, memory or an earlier handoff.

## Summary of the A1 implementation

- **One analytical context**: `fromDate`, `toDate`, comparison mode, selected
  accounts, selected categories including an explicit Uncategorised. Metric is
  fixed to money out and dimension to canonical counterparty, both shown as
  static text. `search`, `transactionClasses`, `minimumAbsoluteAmount`,
  `includeUncategorised` and the selectable metric/dimension are **removed**,
  not hidden.
- **One money-out contribution function** and one contribution set behind the
  headline, the rows, the chart, the exclusions, the drill-down and the
  comparison. No component reads an amount's sign for itself, and the renderer
  recalculates no financial meaning.
- **Reversal attribution** resolved against the full validated snapshot before
  the period, account and category filters, surviving an original outside any of
  them; an original with no canonical counterparty passes its exclusion
  classification to the reversal.
- **Transaction-level category filtering**, tested on the transaction being
  filtered — the reversal on its own `categoryId`, never the original's.
- **Coverage** derived from the selected accounts' `[openingDate,
  lastStatementDate]`, never from the global Forecast reliability boundary;
  independent start-side and end-side limits, every tied account named,
  comparison coverage computed separately.
- **Currency checked before aggregation**, over the whole current population;
  the comparison population checked independently; no conversion anywhere;
  `meta.currencies[0]` is never a result currency.
- **Result-scoped exclusions**, split into *not applicable* and *not
  identified*, each opening its own evidence list, never taken from the snapshot
  header counters.
- **Validation before analysis**, with a bounded typed reason crossing the
  preload boundary and the diagnostic detail staying in the log of the Electron
  process that read the file.
- **Exact money**: integer minor units and the currency exponent become exact
  digits, and `Intl` places separators on that exact string. No division by a
  power of ten anywhere in the display path.
- **Presentation**: r03's shell, states, wording and catalogue; one
  `src/strings/en.json` with no user-facing literal in any component,
  accessible names included; sortable columns with the default one step away;
  the chart following the table's order and values.

### The accepted deltas D1–D6

- **D1** — the evidence plan is thirteen screenshots. F01 is built so a fully
  covered, empty comparison period exists (June 2025 against May 2025), giving
  `Previous: €0.00` and `Change: +€30.00`.
- **D2** — every launch begins at **No data loaded**. The active snapshot is
  session state; **no archive code is carried at all**, so nothing can restore a
  snapshot or a context across launches. A test asserts that no archive is read
  at startup and that the renderer's initial state is unloaded.
- **D3** — after every successful load the context resets to Last month
  (anchored on the UTC calendar date of `generatedAt`), comparison None, all
  accounts, all categories including Uncategorised. Unit tests cover the January
  year-rollover and a leap-year February.
- **D4** — `test/fixtures/a1/truth-manifest.json` is **hand-authored** from the
  construction of the fixtures. It is not generated and no generator exists; the
  fixture builder that emits the snapshot JSON imports nothing from `src/` and
  performs no analysis — its only arithmetic is counting records for the
  snapshot header. Case 26 reads the manifest.
- **D5** — implemented against r003; the two coverage sentences state only what
  the snapshot holds and claim no cause.
- **D6** — all of A–I opened; recorded above.

## Commands run, and their results

On the implementation host (Linux container, Node 22.22.2), from
`ayq/ayq-analyses`:

| command | result |
|---|---|
| `npm test` | **pass** — 72 tests, 0 failures |
| `npm run typecheck` | **pass** |
| `npm run build` | **pass** |
| `npm run package` | **fail at the installer step.** electron-builder produced the Windows application directory `release/win-unpacked/AYQ Analyses.exe` (562 MB, electron 43.4.0, win32 x64) and then stopped: `⨯ wine is required, please see https://electron.build/multi-platform-build#linux` |
| Windows installed-app smoke | **not run** — see *Blocker* |

The application could not be launched even locally: the Electron runtime binary
could not be downloaded on this host (`redirector.gvt1.com` refused by the
egress policy), so `electron .` never started.

`npm test` runs the whole A1 regression matrix — r003 §11 cases 1–26 and r03
§13 case 27 — inside the real test command, not a helper script: inclusive date
edges; month, quarter and year preset boundaries; coverage from an account
subset; tied end limits; start limits; both limits at once; a period wholly
outside coverage; partial comparison coverage; a comparison period before one
account's opening but covered by another; the leap-day same-last-year clamp; a
reversal whose original is outside the period, the accounts or the filter; a
reversal inheriting its original's exclusion; a reversal of something that was
not money-out; mixed current currency refused; a single-currency population
carrying its currency; a broken reversal reference rejected by the validator; a
multi-currency comparison; a differently-denominated comparison; a fully covered
empty comparison as an exact zero; the five contribution rules each on its own;
result-scoped exclusions against the snapshot header counters under a filter; an
empty population inside a covered period; a reconciliation mismatch that still
produces the result; the §8.8 reconciliation invariants; the truth manifest,
exactly, in integer minor units; and case 27.

Beyond the matrix: every amount in every fixture round-trips through the display
path back to the same integer in `en-US`, `nl-NL` and `de-DE`; a value beyond
IEEE-754 safe integer range (`900719925474099387` minor units) prints and reads
back exactly; the locale changes presentation and nothing else; the preset
anchor is the snapshot's UTC `generatedAt` and demonstrably not the machine
clock; tie ordering is deterministic and locale-independent. Four further tests
guard the Electron security settings, the two-capability preload surface, a
renderer that names no path, and a startup that reads no archive; one more fails
if interface text appears in a component instead of the catalogue.

## Fixtures

Under `ayq/ayq-analyses/test/fixtures/a1/`:

`a1-result.json` · `a1-coverage-limited.json` · `a1-empty.json` ·
`a1-insufficient.json` · `a1-comparison-unavailable-currency.json` ·
`a1-unsupported-multicurrency.json` · `a1-invalid-broken-reversal.json` (the
only intentionally invalid one) · `a1-reconciliation-difference.json` ·
`a1-reversal-detail.json` · `a1-not-identified.json` · `truth-manifest.json` ·
`build-fixtures.mjs`

## Screenshots

`evidence/a1/README.md` is present with all thirteen rows, each naming its
fixture, period, accounts, category, comparison mode and the interaction that
reaches the state. **The thirteen `.png` files are absent.** The planned files
are `01_no_snapshot__none.png`, `02_invalid_snapshot__a1-invalid-broken-reversal.png`,
`03_result__a1-result.png`, `04_coverage_limited__a1-coverage-limited.png`,
`05_empty_population__a1-empty.png`, `06_insufficient__a1-insufficient.png`,
`07_comparison_unavailable__a1-comparison-unavailable-currency.png`,
`08_unsupported__a1-unsupported-multicurrency.png`,
`09_coverage_flyout_reconciliation_difference__a1-reconciliation-difference.png`,
`10_reversal_detail__a1-reversal-detail.png`,
`11_not_identified_evidence__a1-not-identified.png`,
`12_comparison_zero__a1-result.png` and
`13_not_in_this_version__a1-result.png`.

The evidence directory is excluded from the packaged application: `package.json`
ships `dist/**/*` and `package.json` only.

## Out of scope — confirmed

- `packages/` is **unchanged**: tree hash
  `230602c7485f9c5018e867c214035f0195df3c5d` at both `b1f0ede3` and this branch
  HEAD.
- No A2, A3 or A4 functionality was added. The five other rail destinations show
  only the accepted not-in-this-version behaviour; there is no Overview
  statement engine, no Fixed costs, no forecast backtesting, no Saved Analyses
  persistence, no Search, no deep link and no snapshot producer. A test fails if
  `expectationRecords`, `expectedOccurrences`, `categoryPlans`, `forecast` or
  `backtest` appears in the engine or the renderer.
- Files touched: `ayq/ayq-analyses/**` and
  `.github/workflows/ayq-analyses-windows.yml` only, the workflow gaining
  `claude/ayq-develop` as a push trigger. `ayq/docs/**` and the root `CLAUDE.md`
  are untouched; the package's own pointer files were adjusted to point at the
  Analyses documents beside them, inside the allowed surface.
- **No real banking or personally identifying financial data was used
  anywhere.** Every fixture, name, amount and identifier is invented.

## Blocker

**A1 was implemented on Linux, not on the Windows Desktop App.** The installed-
application evidence of 007 §20–§21, as extended to thirteen images by 009 §2,
cannot be produced here, and nothing was invented in its place — no browser
mockup, no CI rendering, no fabricated image.

Exactly what is missing: the Windows installer, the installed-app smoke check of
the six states of r003 §5, and the thirteen screenshots.

**Smallest decision needed from the joint leads: who runs the evidence pass on
Windows.** Either this branch is handed to Claude Code on the Windows Desktop
App, which installs it and captures the thirteen images against the plan already
in `evidence/a1/README.md` and pushes them to this same branch; or the joint
leads accept the semantic evidence now and gate human/product acceptance on a
separate Windows evidence pass. Nothing else in the increment waits on that
choice.

## Open items returned rather than decided

Three points the governing documents do not settle. None was silently decided,
and each is one small, isolated change if the joint leads dispose of it
differently.

1. **The comparison "previous period" is derived from the dates, by calendar
   shape.** r003 §4 distinguishes a period that "came from a preset" — shift the
   preset back one unit — from one entered as arbitrary dates — the equal-length
   preceding span. But 007 §5 locks the context to five fields and r03 §5 says a
   preset resolves to dates and the dates are what is reported afterwards, so
   the preset origin is not representable. The engine therefore reads the shape
   back from the dates: a whole calendar month, quarter or year shifts back one
   whole unit; anything else shifts by its own length. Every documented case
   behaves as r003 requires. The only behaviour that differs from a
   preset-origin reading is a *Custom* range that happens to coincide exactly
   with a calendar quarter or year, which then gets the calendar answer.
   `src/dates.ts`, `periodShape` and `previousPeriod`.

2. **A reversal whose original has no canonical counterparty has no
   `evidence.reverses` line.** r03 §9 gives `Reverses {date}, {amount},
   {counterparty}` and no wording for an absent counterparty, while explicitly
   preferring an empty position over a placeholder elsewhere. Such a reversal is
   reached through an exclusion count whose own label already states that no
   counterparty was identified, so the line is omitted rather than filled with
   invented text. Marked in `src/ui/detail.tsx`. One catalogue string would
   settle it.

3. **A value beyond IEEE-754 safe integer range is a formatter test value, not a
   fixture amount.** 007 §15 asks for "at least one fixture/test value beyond
   IEEE-754 safe integer range". Putting such an amount into a snapshot JSON is
   not possible honestly: `JSON.parse` would silently round it and the fixture
   would then state a number it does not hold. The display path therefore
   accepts `bigint` minor units and the round-trip test uses one, while the
   validator refuses a snapshot amount outside the exactly representable range.
   If a fixture amount was intended instead, that needs a contract answer first.

## Status

The pull request is a **draft and unmerged**, and the implementation engineer
does not merge it. Nothing was pushed to `claude/ayq-develop`, no history was
rewritten, no branch was force-pushed, deleted or renamed, and the old Analyses
branch was not merged.
