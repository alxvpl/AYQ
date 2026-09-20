# A1 implementation report

The report 007 §22 requires of the pull request. It lives here as well because
the repository's own rules keep the pull-request body at the blank template for
the person who tests the change to fill in; the same text is posted as a
comment on the pull request.

**Pull request:** [alxvpl/AYQ#1](https://github.com/alxvpl/AYQ/pull/1) — draft, unmerged.

**Status: the corrections of 010 + 011 are applied and the Windows pass of
011 §2 / §9 is complete.** The thirteen installed-application images are in
this directory with their capture record in `README.md`. Nothing is left for
a second Windows pass. Technical acceptance (ChatGPT) and human/product
acceptance (Claude Chat) are the joint leads' to give.

## Revision record

| | |
|---|---|
| base (`claude/ayq-develop`, unchanged, nothing pushed to it) | `b1f0ede3f6e5fb821e4a1333d111fcfbf89a04f5` |
| head reviewed by 010 / 011 | `54469f13ee5fdfff843375fedef13d99bfa26562` |
| corrections (P3, T1, T2.1–T2.5) | `6dbee8ef9` |
| two presentation defects seen only in the installed window | `885057628` — the head the installer was built from |
| this record and the thirteen images | the commit that carries this file; it changes no source |
| `packages/` | untouched |

## Governing inputs, opened before editing

010, 011 and 012 in full, in that order; `AYQ_ANALYSES_COLLABORATION_MODEL`
and `AYQ_ANALYSES_PROJECT_WORK_INSTRUCTIONS` (both ACCEPTED);
`AYQ_ANALYSES_A1_SPECIFICATION` **r004** (ACCEPTED, supersedes r003); the
frozen r003 contract `AYQ_Analyses_analytical_data_contract-r003.md` §6–§7
and its reference validator `ayq_snapshot_validator-r003.py`, read for the
exact shape of I5, I7 and I14 that T2.2, T2.4 and T2.5 enforce. None was
substituted by a repository mirror, memory or an earlier handoff.

## The corrections, as applied

### P3 — a reversal whose original has no canonical counterparty

- `src/strings/en.json`: `evidence.reversesNoCounterparty` — "Reverses {date},
  {amount}". No placeholder for the missing name.
- `src/evidence.ts` (new): the reversal explanation is selected here, outside
  any component — the original named by date and amount, plus its counterparty
  when it has one; then the outside-period / accounts / filter / selection
  sentence exactly as for any reversal. `src/ui/detail.tsx` renders the lines
  this function returns; the OPEN note at that spot is gone.
- `test/evidence.test.ts`: the no-counterparty reversal (both exclusion
  classes) receives the new sentence and the outside-period sentence, with no
  placeholder, trailing separator or identifier; the ordinary reversal keeps
  its three-part sentence; screenshot 10's fixture is asserted line for line.
  The catalogue scan of `test/strings.test.ts` covers the new key.

### T1 — exact arithmetic through aggregation

- A validated snapshot amount becomes a `bigint` at the contribution boundary
  (`exactMinor` in `src/engine.ts`, the one place a Number becomes money the
  engine adds). Everything after it is bigint: `Contribution.amountMinor`,
  `CounterpartyRow.moneyOutMinor / previousMinor / changeMinor`,
  `ExclusionGroup.amountMinor`, `ComparisonFacts.totalMinor`,
  `AnalysisResult.totalMinor / deltaMinor`, `ReconciliationFact.differenceMinor`
  (`src/types.ts`). Snapshot `Money.amount` stays a JSON number validated as
  `Number.isSafeInteger`, per 011 §5.
- Absolute value, sums, deltas and the per-counterparty comparison map are
  bigint arithmetic. Ordering (`src/sort.ts`) compares with `<` / `>` and
  never subtracts. The validator's reconciliation-difference check compares in
  bigint as well.
- Chart rule: `src/geometry.ts` derives a bounded, display-only Number for bar
  length from the exact rows — exact while every value is safe, otherwise all
  values divided by one common power of ten, keeping sign, order and
  proportion. Bar labels and tooltips print the exact bigint row value through
  the one formatter. Nothing derived for geometry re-enters a result.
- Tests state expectations as bigint literals; `test/truth-manifest.test.ts`
  converts the hand-authored manifest's small integers explicitly (`exact()`).
  `test/exact-aggregate.test.ts`: two individually safe `-9007199254740991`
  amounts (each accepted by the validator) aggregate to `18014398509481983n`
  — beyond `Number.MAX_SAFE_INTEGER`, which a Number demonstrably cannot hold
  — in the row, the headline and the drill-down; the formatter prints
  `€180,143,985,094,819.83` and reads it back exactly in `en-US`, `nl-NL`,
  `de-DE`; a comparison and delta at that magnitude are exact; two rows one
  minor unit apart at that magnitude order correctly; chart geometry is
  exact within the safe range and bounded beyond it.

### T2 — A1-relevant frozen-r003 validation (`src/validate.ts`)

Each refusal is an internal inconsistency of the file and carries the
`invariant` reason, so the screen shows the existing
`snapshot.invalid.reason.invariant` sentence — no new string, no new reason
code, as 012 §1 requires. Tests in `test/validate.test.ts`, each by mutating
`a1-result.json`.

| | rule enforced | refused, for example | accepted, for example |
|---|---|---|---|
| T2.1 | `meta.generatedAt` is RFC 3339 UTC: `YYYY-MM-DDTHH:MM:SS[.fff]` with the offset written `Z` or `+00:00` | `…T06:00:00+02:00`, `…T06:00:00-00:00`, `…T06:00:00` (no offset), `2026-03-05 06:00:00Z`, a bare date | `…Z`, `….250Z`, `…+00:00` |
| T2.2 | a transaction's currency equals its account's | USD on the EUR *Everyday account* (with USD declared in `meta.currencies`, so the refusal is this rule and not the declared-currency rule) | — |
| T2.3 | `openingBalance`, `ledgerBalance`, `statementCoverage.closingBalance` and all three reconciliation money fields are in the account's currency | each of the six, one at a time | — |
| T2.4 | `categoryId ≠ null` ⇒ `categorisation` present with `source` `manual` or `rule`; `source = rule` ⇒ non-empty `ruleKey` | `categorisation: null`, `{source:'none'}`, `{source:'rule', ruleKey:null}`, `{…, ruleKey:''}`, `{source:'rule'}` | `{source:'manual'}`, `{source:'rule', ruleKey:'rule-002'}` |
| T2.5 | `isInternalTransfer` ⇒ `categoryId = null` and `counterpartyKey = null` | the transfer `f01-t08` given a category; given a counterparty | — |

The `utcCalendarDate` helper remains independently testable on arbitrary
instants; only the snapshot rule is the validator's (011 §7 T2.1).
`test/helpers.ts` now builds internal transfers without a category or a
counterparty, so every helper-built snapshot in the matrix is contract-valid
under T2.5; the engine cases are unchanged in outcome.

## Two defects the installed window showed, fixed at `885057628`

Neither is a semantic change; both were visible only in the real window and
are reported here rather than left for a second pass:

1. **The rail and the status bar ended at content height** on the empty
   screens. The shell is `height: 100%` of the Fluent provider, which had no
   height. The provider now spans the window (`src/renderer.tsx`).
2. **The longest bar's printed figure was clipped** at the chart's right edge
   (the €120.00 label read "€12"). The value axis now ends a quarter beyond the
   longest bar (`src/ui/result.tsx`); the printed figure is unchanged and still
   the exact row value.

If the joint leads prefer either handled differently, each is one line.

## Commands run on Windows, and their results

Windows 11 Pro 10.0.26200 x64, Node v24.21.0, npm 11.19.0, from
`ayq/ayq-analyses`, at `885057628`:

| command | result |
|---|---|
| `npm ci` | pass (Electron 43.4.0 runtime binary present) |
| `npm test` | **pass — 84 tests, 84 pass, 0 fail** (72 at 54469f13 + 12 new) |
| `npm run typecheck` | **pass** |
| `npm run build` | **pass** |
| `npm run package` | **pass** — `release/AYQ Analyses-0.1.0-windows-x64-setup.exe`, 139 022 633 bytes, SHA-256 `3F37D87F314B8AD628BE89626FB2AAEF2893C61E74190B4A7CF4FA7AB29DCEBD` (unsigned; no certificate is configured) |
| install (`setup.exe /S`) | **exit 0** — `%LOCALAPPDATA%\Programs\ayq-analyses\`, registered *AYQ Analyses 0.1.0*, Start-menu shortcut; installed `app.asar` SHA-256 `DA8C7E73DE5DC3FA44819E61FD73D5525A6C54CB346FB6964C6678B316FEB37E` |
| installed-app smoke pass | **done** — all six states of r004 §5 reached on the installed executable with synthetic fixtures only: Result, Coverage-limited, Empty, Insufficient, Comparison unavailable, Unsupported; plus the invalid-snapshot refusal, the coverage flyout, the reversal drill-down, the exclusion evidence list, the exact-zero comparison and the not-in-this-version destination |
| thirteen screenshots | **captured** — see `README.md` for the method per image |

Two environment notes, neither a repository change: the repository's agent
hooks require `jq`, which was installed on this machine for the session; and
electron-builder's `winCodeSign` archive contains macOS symlinks that this user
account cannot create, so it was extracted into electron-builder's own cache
without the `darwin` entries before packaging (the Windows tooling it needs is
all under `windows/`).

## Fixtures

Unchanged from 54469f13. Under `test/fixtures/a1/`: the nine valid snapshots,
the one intentionally invalid one, `truth-manifest.json` (hand-authored) and
`build-fixtures.mjs`. All nine valid fixtures pass the validator with
T2.1–T2.5 in force.

## Screenshots

All thirteen `.png` files named in `README.md` are present, each the real
window of the NSIS-installed build running on Windows, captured by
`PrintWindow` on the application's own window at its default size. The
directory is excluded from the packaged application.

## Out of scope — confirmed

- `packages/` is **unchanged** on this branch.
- No A2, A3 or A4 functionality was added; the boundary tests still fail if
  `expectationRecords`, `expectedOccurrences`, `categoryPlans`, `forecast` or
  `backtest` appears in the engine or the renderer.
- Files touched on this pass: `ayq/ayq-analyses/src/**`,
  `ayq/ayq-analyses/test/**`, `ayq/ayq-analyses/evidence/a1/**`. `package.json`
  and the lockfile are unchanged.
- **No real banking or personally identifying financial data was used
  anywhere.** Every fixture, name, amount and identifier is invented; no real
  snapshot was opened on this machine.

## Dispositions received, and how they landed

- P1 (installed-Windows evidence): performed, above.
- P2 (previous period by calendar shape): accepted in 011 §3 and written into
  r004 §4; `src/dates.ts` already implemented it — no change.
- P3: applied, above.
- Returned item 3 (beyond-safe value): accepted in 011 §5 as implemented —
  snapshot amounts stay safe JSON integers, the formatter takes bigint; T1
  adds exactness through aggregation.

## Observations returned, not decided

None blocks the pass. Each is stated so it is not silently absorbed.

1. **The frozen r003 reference validator is stricter than T2.4 in one
   direction.** It also refuses a transaction with `categoryId = null` whose
   `categorisation.source` is `manual` or `rule` ("no category but claims
   provenance"), and it requires `categorisation` to be an object with
   `source: 'none'` rather than `null` for an uncategorised transaction. T2.4
   as enumerated in 011 §7 enforces only the forward direction, and
   `build-fixtures.mjs` gives every transaction with a counterparty a `rule`
   provenance whatever its category, so the salary rows `f01-t07` and
   `f03-t01` carry `{source:'rule'}` with no category, and uncategorised rows
   carry `categorisation: null`. A1 is unaffected on screen. Whether the
   Analyses validator should adopt the reverse-direction rule and the
   fixtures be regenerated is a contract question for ChatGPT.
2. **The installed window carries Electron's default menu bar** (File, Edit,
   View, Window). It was there at 54469f13, r03 does not mention it and no
   correction names it; it is visible in every image. A presentation
   disposition for Claude Chat.
3. **The date inputs reject an intermediate value while a year is typed** —
   each digit fires a change, and a year of `0002` puts `toDate` before
   `fromDate`, which the control refuses, so the field snaps back. Setting
   the year with the arrow key works. Reached while entering 1 – 30 June 2025
   for image 12 through the real window; not a semantic matter, noted for
   the product side.

## Status

The pull request is a **draft and unmerged**, and the implementation engineer
does not merge it. Nothing was pushed to `claude/ayq-develop`; no history was
rewritten; no branch was force-pushed, deleted, renamed or created. This
branch was pushed to its own remote ref only.
