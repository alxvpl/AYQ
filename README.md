# AYQ

A standalone personal finance application. Windows first, Android after. Its
own product — not a module of CIVION and never becoming one: separate
databases, no writing across the boundary.

## Architecture

Actual (MIT, `actualbudget/actual`, HEAD `db1b0ea`, v26.9.0) as the finance and
sync engine, with an entirely custom AYQ interface. The stable Node API runs in
an Electron background process and the UI talks to it over typed IPC — the same
boundary Actual itself already uses in production.

MoneyMatter is out as a code base (AGPL plus a CLA, and no offline layer). Its
domain model is used as a specification: read it, implement our own, copy
nothing.

Forking the whole Actual monorepo comes only after the spike passes.

## Status

The spike is in progress. Steps 1 and 2 — measurement over 212 real daily
CAMT.053 files — are done; the results live outside this repository.

**Step 3.** [`packages/ayq-camt`](packages/ayq-camt) turns CAMT.053 into a
lossless intermediate bank record and resolves the counterparty through a chain
of evidence that starts at `BkTxCd` rather than at an IBAN. Its `verify` command
checks the whole export against the measured criteria in one run; that run
against the 212 real files is still outstanding, because the files live on the
owner's machine and nowhere else.

**Step 4.** [`packages/ayq-actual-bridge`](packages/ayq-actual-bridge) loads
those records into Actual through the stable Node API, headless — no Actual UI,
no sync server, no monorepo build — and reads the ledger back out. Amounts,
resolved payees and deduplication across re-exports are asserted end to end.
What Actual has no field for travels beside the budget as provenance.

**Step 5.** [`packages/ayq-screen`](packages/ayq-screen) is one screen of our
own — not an Actual screen — against the same engine, listing transactions
grouped by normalised counterparty. The screen never imports the Actual API: it
sends a request over a single channel and receives an answer, which is the same
boundary Electron IPC will carry after the fork. On the invented month it
reports 14 distinct bank descriptions collapsing into 5 counterparties.

With that the spike is technically complete. What remains is not spike work:
forking the Actual monorepo, `ayq-client` and `ayq-desktop`, and the typed IPC
that replaces the spike's HTTP host.

## Rules

- Real bank data never enter this repository and are never uploaded anywhere.
  Every fixture is invented.
- Everything new is named `ayq-*`.
- CIVION is not touched. When the AYQ-to-CIVION contract comes up: AYQ is an
  untrusted source, entering as a candidate, never as an accepted payment.
- English is the language of this repository: documentation, code,
  comments, tool output, reports and commit messages.
