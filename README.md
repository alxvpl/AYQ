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

**Step 3 is this code.** [`packages/ayq-camt`](packages/ayq-camt) turns
CAMT.053 into a lossless intermediate bank record and resolves the counterparty
through a chain of evidence that starts at `BkTxCd` rather than at an IBAN.

Steps 4 (headless loading through `@actual-app/api`) and 5 (one custom screen
against the same API) have not been started.

## Rules

- Real bank data never enter this repository and are never uploaded anywhere.
  Every fixture is invented.
- Everything new is named `ayq-*`.
- CIVION is not touched. When the AYQ-to-CIVION contract comes up: AYQ is an
  untrusted source, entering as a candidate, never as an accepted payment.
- Documents and code are written in English.
