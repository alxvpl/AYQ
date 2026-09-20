# A1 installed-application evidence

Thirteen screenshots of the installed Windows application, each reached from a
synthetic fixture under `../../test/fixtures/a1/`. Every value in them is
invented: no real banking or personally identifying financial data may ever be
placed in this directory (03 §6, AYQ §12).

This directory is not part of the packaged application. `package.json` ships
only `dist/**/*` and `package.json`, so nothing here reaches an installer.

## Status of the images

**The thirteen `.png` files are not present.** They could not be produced in the
session that implemented A1, and no substitute was created: a browser mockup or
a CI rendering is not evidence of the installed application, and an invented
image would be worse than none.

What was reached on the implementation host (Linux container):

| step | result |
|---|---|
| `npm test` | 72 tests pass |
| `npm run typecheck` | passes |
| `npm run build` | passes |
| `npm run package` | Windows application directory produced (`release/win-unpacked/AYQ Analyses.exe`); the NSIS installer step fails: `wine is required` |
| launch the built application | not reached: the Electron runtime binary could not be downloaded on this host |

The rows below are the evidence plan, complete and ready to execute: each names
the fixture, the analytical context and the interaction that reaches the state.
Running them on Windows produces the thirteen images and nothing else is
needed. See the pull request for the blocker as reported to the joint leads.

## What each screenshot shows

Unless a row says otherwise, the context is the one A1 resets to after a
successful load: period `Last month` resolved against the snapshot's own
`generatedAt` (all fixtures are generated `2026-03-05T06:00:00Z`, so that is
1 – 28 February 2026), comparison `None`, all accounts, all categories
including Uncategorised.

| # | file | fixture | period | accounts | category | comparison | interaction |
|---|---|---|---|---|---|---|---|
| 01 | `01_no_snapshot__none.png` | none | — | — | — | — | Launch the application. It opens on Explore with **No data loaded**. |
| 02 | `02_invalid_snapshot__a1-invalid-broken-reversal.png` | `a1-invalid-broken-reversal.json` | — | — | — | — | **Load snapshot…**, choose the fixture. The snapshot is refused and no analytical result appears. |
| 03 | `03_result__a1-result.png` | `a1-result.json` | 1 – 28 Feb 2026 | all | all | Previous period | Load the fixture, set Comparison to **Previous period**. Headline €246.25, three counterparties, both exclusion counts. |
| 04 | `04_coverage_limited__a1-coverage-limited.png` | `a1-coverage-limited.json` | 1 – 28 Feb 2026 | all | all | None | Load the fixture. The result stands over the requested dates with both the end-side and the start-side sentence. |
| 05 | `05_empty_population__a1-empty.png` | `a1-empty.json` | 1 – 28 Feb 2026 | all | all | None | Load the fixture. **No matching transactions.** and nothing about reliability. |
| 06 | `06_insufficient__a1-insufficient.png` | `a1-insufficient.json` | 1 – 28 Feb 2026 | all | all | None | Load the fixture. **No data for this period.** with each account's coverage interval. |
| 07 | `07_comparison_unavailable__a1-comparison-unavailable-currency.png` | `a1-comparison-unavailable-currency.json` | 1 – 28 Feb 2026 | all | all | Previous period | Load the fixture, set Comparison to **Previous period**. The euro result stands; the comparison states the currency reason. |
| 08 | `08_unsupported__a1-unsupported-multicurrency.png` | `a1-unsupported-multicurrency.json` | 1 – 28 Feb 2026 | all | all | None | Load the fixture. No figure, no chart, no table; the exclusion line keeps its count without an amount. |
| 09 | `09_coverage_flyout_reconciliation_difference__a1-reconciliation-difference.png` | `a1-reconciliation-difference.json` | 1 – 28 Feb 2026 | all | all | None | Load the fixture, open the coverage indicator. One account differs from its statement by €15.00, with the note beneath. |
| 10 | `10_reversal_detail__a1-reversal-detail.png` | `a1-reversal-detail.json` | 1 – 28 Feb 2026 | all | all | None | Load the fixture, select the **Superstore** row. The refund appears under Superstore, names the original, and says the original falls outside the period. |
| 11 | `11_not_identified_evidence__a1-not-identified.png` | `a1-not-identified.json` | 1 – 28 Feb 2026 | all | all | None | Load the fixture, select **Counterparty not identified**. The pane lists exactly those two transactions, with the Counterparty position left empty. |
| 12 | `12_comparison_zero__a1-result.png` | `a1-result.json` | 1 – 30 Jun 2025 | all | all | Previous period | Load the fixture, set the period to 1 – 30 June 2025 and Comparison to **Previous period**. May 2025 is fully covered and holds nothing: **Previous: €0.00** and **Change: +€30.00**. |
| 13 | `13_not_in_this_version__a1-result.png` | `a1-result.json` | — | — | — | — | Load the fixture, then select **Fixed costs** in the rail. One centred line: **Not in this version.** |

## Expected figures

The exact figures behind rows 03, 04, 12 and the exclusion counts are stated
independently in `../../test/fixtures/a1/truth-manifest.json`, which is
hand-authored from the fixture construction and is what regression case 26
checks the engine against. A screenshot that disagrees with the manifest is a
defect in the application, not in the manifest.
