# AYQ

A standalone personal finance application. Windows first, Android after. Its
own product — not a module of CIVION and never becoming one: separate
databases, no writing across the boundary.

## What this repository is

A fork of the whole `actualbudget/actual` monorepo, baselined at
`db1b0ea9754191b4b505f801132f067d7bc2457b` (v26.9.0), with the AYQ spike
alongside it. Upstream's history is merged in whole, not copied: `git log`
reaches every one of Actual's commits, and `git merge upstream/master` keeps
working.

- `packages/` is upstream's, byte for byte. Nothing in it has been touched,
  `desktop-client` included — it stays in the tree so upstream merges apply
  cleanly, and is simply not built or routed.
- `ayq/` is ours. Today it holds the spike; `ayq-client` and `ayq-desktop`
  will join it.
- Two files are shared and therefore resolved rather than inherited: this
  README (upstream's is kept verbatim as `README.actual.md`) and `.gitignore`
  (upstream's verbatim, with an AYQ block appended).

## Architecture

Actual (MIT) is the finance and sync engine; the interface is entirely ours.
The stable Node API runs in an Electron background process and the UI talks to
it over typed IPC — the same boundary Actual itself already uses in production.

MoneyMatter is out as a code base (AGPL plus a CLA, and no offline layer). Its
domain model is used as a specification: read it, implement our own, copy
nothing.

## Status

The spike is in progress. Steps 1 and 2 — measurement over 212 real daily
CAMT.053 files — are done; the results live outside this repository.

**Step 3.** [`ayq/ayq-camt`](ayq/ayq-camt) turns CAMT.053 into a
lossless intermediate bank record and resolves the counterparty through a chain
of evidence that starts at `BkTxCd` rather than at an IBAN. Its `verify` command
checks the whole export against the measured criteria in one run; that run
against the 212 real files is still outstanding, because the files live on the
owner's machine and nowhere else.

**Step 4.** [`ayq/ayq-actual-bridge`](ayq/ayq-actual-bridge) loads
those records into Actual through the stable Node API, headless — no Actual UI,
no sync server, no monorepo build — and reads the ledger back out. Amounts,
resolved payees and deduplication across re-exports are asserted end to end.
What Actual has no field for travels beside the budget as provenance.

**Step 5.** [`ayq/ayq-screen`](ayq/ayq-screen) is one screen of our
own — not an Actual screen — against the same engine, listing transactions
grouped by normalised counterparty. The screen never imports the Actual API: it
sends a request over a single channel and receives an answer, which is the same
boundary Electron IPC will carry after the fork. On the invented month it
reports 14 distinct bank descriptions collapsing into 5 counterparties.

The spike is complete and closed: verified against the real 212-file export —
212 files, 0 parse errors, 567 entries, 350 with `<TxDtls>`, 217 without,
`BkTxCd` and both dates on all 567, no batched entry, and no unread XML path.

The monorepo fork is in place.

**The desktop skeleton.** [`ayq/ayq-client`](ayq/ayq-client) is the AYQ
renderer — ours, not Actual's — and [`ayq/ayq-desktop`](ayq/ayq-desktop) is the
Electron host that serves it. The boundary the spike proved over HTTP is now
typed IPC:

```
ayq-client ──▶ typed IPC ──▶ Electron background ──▶ @actual-app/api
```

The renderer imports no Actual code and has no `require` and no `process` to
reach it with; a test enforces that on the source and on the built bundle. One
request, `engine.status`, is answered from a real budget: balances computed by
the engine's spreadsheet, the transaction count by its own query language.

## Rules

- Real bank data never enter this repository and are never uploaded anywhere.
  Every fixture is invented.
- Everything new is named `ayq-*`.
- `packages/` is upstream's. Changes there are merge debt; AYQ code goes in
  `ayq/`. `desktop-client` in particular is never the AYQ interface.
- The renderer never imports the engine. Everything crosses the typed IPC
  contract in `ayq-client/src/ayq-ipc-contract.ts`.
- CIVION is not touched. When the AYQ-to-CIVION contract comes up: AYQ is an
  untrusted source, entering as a candidate, never as an accepted payment.
- English is the language of this repository: documentation, code,
  comments, tool output, reports and commit messages.
