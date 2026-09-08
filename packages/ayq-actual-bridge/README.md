# ayq-actual-bridge

Step 4 of the spike: load the intermediate bank records into Actual through the
stable Node API, headless — no Actual UI, no sync server, no monorepo build.

`@actual-app/api` 26.9.0 installs from npm on its own (MIT, `node >= 20`), as
the measurement predicted. Nothing here forks anything.

## What it proves

The base evaluation's recommendation rests on one claim: that Actual's core is
usable as an engine behind an interface of our own. Step 3 produced the records;
this step puts them through the boundary and reads them back.

```bash
npm install
npm test          # 9 tests, two of which drive the real API
npm run typecheck
```

The round-trip test creates a budget in a temporary directory, creates an
account, imports the nine records of the invented fixture day, then reopens the
budget and reads the ledger back. It asserts that the ledger totals exactly what
was sent, that the card payment carries the resolved merchant as its payee while
the bank's raw string survives as `imported_payee`, that a bank charge is
attributed to the bank, and that the intermediary never becomes a payee.

A second test re-imports the same day under a different export file name and
asserts nothing is added — deduplication holds across re-exports, which it must,
because ABN AMRO names each export after the moment of download.

## The mapping

`ayqToActualTransaction` is deliberately narrow, because Actual models less than
the bank gives:

| AYQ record | Actual transaction |
|---|---|
| `amount.raw` + `creditDebitIndicator` | `amount`, signed integer cents |
| `bookingDate`, falling back to `valueDate` | `date` |
| resolved counterparty name | `payee_name` |
| what the bank said (Actual's five-field output) | `imported_payee` |
| the bank's description | `notes` |
| `AcctSvcrRef`, falling back to `ayqKey` | `imported_id` |
| `Sts` | `cleared` |

Two choices worth stating, both reversible because the record keeps everything:

- **The date is `BookgDt` first.** Actual's own CAMT importer prefers `ValDt`.
  The booking date is what the statement shows and what a person recognises;
  both dates stay in the record and in the provenance.
- **Cents are parsed from the digits, not from a float.** `23.45 * 100` is
  `2344.9999999999995`, and leaning on rounding to hide that is a habit worth
  not forming with money. A third decimal rounds half away from zero.

## Provenance

Actual's schema has `imported_description` and `financial_id` but no field for a
counterparty account, a bank transaction code or a SEPA mandate — the base
evaluation found this in §4 and the measurement confirmed it.

Rather than smuggle those into the notes, `ayq-provenance.json` is written next
to the budget, keyed by the same `imported_id` the transaction carries. It holds
the counterparty IBAN, `BkTxCd`, the mandate, `EndToEndId`, the agent BIC, both
dates, the status, the purpose, the return reason and the currency exchange —
plus **which layer resolved the counterparty**, so a name in the ledger can
always be traced back to the evidence that produced it.

This is the shape of the gap that a fork would close properly, by adding the
fields to the schema. Until then, nothing is lost; it just lives beside the
budget instead of inside it.

## Notes on running the API headless

- The API is a singleton with global state. Every function here opens it and
  closes it around one unit of work, and the tests run with
  `--test-concurrency=1` for the same reason.
- `runImport` is the way to build a budget from nothing. `loadBudget` reopens
  one that already exists.
- At the end of an import Actual logs
  `cloudStorage.upload failed ... unauthorized`. That is it reaching for a sync
  server that was never configured. The local budget is unaffected.
- Imports go to a directory you choose and nothing leaves it.

## Cross-package imports

This package imports `ayq-camt` by relative path
(`../../ayq-camt/src/...`) rather than as a dependency. Node strips types from
project files but refuses to do so inside `node_modules`, so a `file:` link
would need a build step that the spike does not otherwise need. When the
monorepo fork happens, both packages become workspaces and the imports become
package names.

## Scope

Step 4 ends here. Step 5 — one screen of our own against the same API, listing
transactions by normalised counterparty — has not been started.

Real bank data never enter this repository. Every fixture is invented.
