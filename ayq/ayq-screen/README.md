# ayq-screen

Step 5 of the spike: one screen of our own — not an Actual screen — against the
same engine, listing transactions grouped by normalised counterparty.

This is the step the base evaluation asked for last, and the one that answers
the question the whole choice of base rests on: can an interface of our own sit
on Actual's core without touching it?

## What it shows

```bash
npm install
npm test          # 4 tests, all driving the real engine
npm run typecheck

# the invented fixtures
node src/ayq-demo.ts

# your own export, locally — a directory, an XML file, or the ZIP as downloaded
node src/ayq-demo.ts ~/Downloads/00000000_010126000000.zip
```

The demo parses CAMT, resolves the counterparty, imports into a fresh Actual
budget, opens the engine and serves the screen on `127.0.0.1`. Nothing leaves
the machine and nothing is written outside the data directory.

On the invented month the screen reports what the measurement predicted: the
bank wrote **14 distinct descriptions for 5 counterparties**. Six visits to one
supermarket, under six different raw strings — different branch numbers,
different wallets, a different terminal, date and time each time — arrive as one
line. Opening it shows all six with the bank's string kept underneath, the
`BkTxCd` and the layer that decided the name.

## The boundary, which is the point

`src/ayq-contract.ts` is the deliverable. The screen never imports
`@actual-app/api`; it sends an `AyqRequest` and receives an `AyqResponse`.

```
ayq-screen.html  ──POST /ask──▶  ayq-host.ts  ──▶  ayq-engine.ts  ──▶  Actual
     (the screen)                (transport)         (the engine)
```

The transport is one channel carrying the whole contract, on purpose: the
shipped Actual desktop app talks to its forked engine process over a single
generic `message` channel plus a handful of named host channels (§12.2 of the
base evaluation). When AYQ moves into Electron, `ayq-host.ts` is replaced by an
IPC bridge and neither the screen nor the contract changes.

Amounts cross the boundary as integer cents, the way Actual stores them.
Formatting is the screen's business.

## The join

Actual holds the money and the payee. The provenance written beside the budget
holds the normalised key and the layer that produced it. They meet on
`imported_id`, and that join is what makes grouping by counterparty possible at
all — Actual has no field for it.

A transaction with no provenance still groups somewhere: it falls back to its
payee name, and the screen shows that no layer claimed it. Nothing is dropped
to make the totals look tidy; the tests assert that the groups sum to the
period.

## The screen itself

One page, no framework, no network beyond its own host, no build step. A dense
ledger: tabular numerals, a light and a dark palette, rows that open in place.
Every group carries its evidence on its face — which layer resolved it, whether
an intermediary stood in the way, whether a mandate or an IBAN is known, and how
many raw descriptions were collapsed.

It is a spike screen, not the product's design. What it settles is that the
boundary holds and that the grouping is worth having.

## Scope

The spike ends here. What remains is not spike work: forking the Actual
monorepo, `ayq-client` and `ayq-desktop`, and the typed IPC that replaces
`ayq-host.ts`.

Real bank data never enter this repository. Every fixture is invented.
