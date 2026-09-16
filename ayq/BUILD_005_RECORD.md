# AYQ 0.2.0 / build 005 — implementation record

What was built, what was measured before it was built, and the one place two
locked requirements had to be read together. Kept here so a session that is
interrupted can be resumed from the repository rather than from a chat.

Canon is on Drive and is not edited from here.

## What this delivery is

| | |
|---|---|
| Product | AYQ Personal Finances |
| Product version | 0.2.0 |
| Delivery label | AYQ build 005 |
| Windows target | x64 |
| Installer | `AYQ-build-005-windows-x64-setup.exe` |
| Store schema | version 8 |
| Engine | `@actual-app/api` 26.9.0 |
| Actual baseline | `db1b0ea9` |
| `packages/` | unchanged |

## The experiment that came first

§4.2 asks for the technical starting balance to be written through
`@actual-app/api` and forbids both SQL and an ordinary balancing transaction.
Whether that is possible at all was measured on a synthetic budget against
26.9.0 before a line of it was written:

1. `createAccount(..., openingCents)` with a **non-zero** opening creates one
   transaction carrying `starting_balance_flag = true`, payee `Starting
   Balance`, dated the day the account was created, cleared.
2. With an opening of **nought** it creates no transaction at all.
3. `addTransactions` **will** create a row carrying that flag, so an account
   that has none can be given one through a supported operation.
4. `updateTransaction(id, { amount })` and `{ date }` both take effect on it.
5. Reads lag writes: a query issued immediately after either comes back with
   the old row, and after about 300ms with the new one. `ayqSettle` is the
   existing tool for exactly this and is what the anchor write uses.
6. `getAccountBalance(accountId, cutoff)` answers the balance as at a day.

So the expected implementation in §4.2 is possible as written, and that is what
`ayq-anchors.ts` does. No SQL, no balancing transaction, and the result is read
back from Actual rather than declared.

One thing the engine does **not** have: `$min` is not an AQL function in 26.9.0.
Two places that wanted it — the earliest movement in an account, and the day an
account was first seen — read an ordered query instead.

## Where §4.2 and 03 §8 had to be read together

This is the one place the task's own requirements pull against each other, and
it is recorded here because the resolution is a judgement rather than a
transcription.

§4.2 makes Actual's balance at the anchor's day **equal the anchor**, by
construction. §4.4 makes a bank-stated closing balance an anchor. Reconciliation
as build 004 computed it — the bank's figure against the account's balance —
therefore becomes a number compared with itself, always zero, and the
"coverage and reconciliation, both ways" gate that has run since build 003
would have had to be deleted to get green.

Deleting it would have been weakening a gate, which §15 forbids. So the
comparison moved to the thing that can still come out wrong:

    the balance the bank stated at an earlier point
  + every movement AYQ holds between that point and this one
  = what AYQ can account for here

and the difference from the bank's own closing figure is what is stated. A
difference now means **statements are missing over that interval** — a fact
about AYQ's evidence rather than about the account — which is exactly what
03 §8.3 says to state and leave standing, and nothing is written to close it
(§8.2). `AyqReconciliation.ledgerBalanceCents` is that figure, not the balance;
the type says so.

Both locked requirements hold. Nothing was bypassed and no gate was weakened.

## Stages

| Stage | What it delivers | State |
|---|---|---|
| S1 | Starting-balance experiment; store version 8 and its migration | done |
| S2 | Coverage intervals, balance anchors, Unknown as a state | done |
| S3 | Today's operational facts; Accounts off the rail | done |
| S4 | Owner counterparty display names | done |
| S5 | Strict Upcoming qualification | done |
| S6 | Plan historical suggestions | done |
| S7 | Starter taxonomy version 1 | done |
| S8 | Settings → About, and real build metadata | done |

## Store version 8

Four fields, and every one of them added empty or unknown.

- `anchors` — every absolute balance reading, as a history. A correction adds;
  it never writes over. `ayqActiveAnchor` folds them in decision order, which is
  how the three rules in §3.1 are expressed: a manual re-anchor is the owner
  correcting something and always wins when it is the most recent decision; a
  bank anchor has to reach further than what already stands.
- `evidence` — coverage as intervals, with the closing balance optional. This
  is the substantive fix to version 7, which recorded coverage **only** where
  the bank had stated a closing balance, so a file proving a whole month of
  movements advanced nothing at all.
- `counterpartyNames` — what the owner calls a counterparty, kept apart from the
  alias table because an alias merges identities and a name merges nothing.
- `starterTaxonomyVersion` — nought on every migrated store.

The migration invents nothing. Version 7's coverage map is carried across with
its `toDate`, closing balance, file and read time intact and its `fromDate`
**null**, because version 7 never recorded one. Deriving a start from the first
imported transaction would be AYQ manufacturing the evidence 03 §8.2 forbids it
to manufacture, and the consequence is deliberate and is pinned by a test:
legacy evidence proves no complete month, so Plan suggestions do not count
months that only legacy coverage reaches.

No anchor is created by the migration either. A closing balance in a version 7
store is a figure in a file; §4.4 is what turns one into an anchor, and it runs
at import with an account in hand.

## Unknown, and what it takes with it

An account with no anchor has `balanceCents: null`. Null is drawn as the word
`Unknown`, in the interface face rather than the figure face, in the place the
number would have been — including the largest figure on Today. `AyqFigure`
handles it in one place, so a null cannot become a nought on the way to a
screen.

If **any** counted account is unknown, available funds and total held are null,
and with them every absolute figure in the forecast: the lowest point, each
month's closing position, and every event's running balance. What stays is
everything relative — which occurrences are expected, what they come to, what a
month is expected to take in and pay out — because none of that needs a starting
position.

## The rail

Eight destinations, Settings included. Accounts is not one of them: an account
is not a place a person goes, it is something they look at when Today raises a
question about it. The route survives internally and is never drawn in the rail,
and the Windows acceptance run measures the count on the drawn window.

## Strict Upcoming

Build 004 offered a suggestion whenever the **median** interval fell in a
cadence window, at the **average** amount. On a supermarket that produced a
confident expectation of a figure nobody had ever been charged, and it was
subtracted from the position on Today.

Version 005 requires the same counterparty, the exact same amount to the cent,
and **every** consecutive interval inside one window. The median is used only to
place the next date, and only after every interval has already passed. A SEPA
mandate qualifies nothing on its own. Two different exact amounts under one
counterparty are two series.

Offers a previous AYQ made under the looser rule are reconsidered once, on the
way in, and withdrawn to a new `retired` state — deliberately not `dismissed`,
which means *a person said this will not happen*. A retired record stops
appearing and stops counting, and keeps its history, its matches and the
pairings the owner refused.

## Plan suggestions

An arithmetic mean over the complete, reliably covered months behind the Plan
month, up to twelve. The divisor is the months actually included. An incomplete
month is excluded rather than counted as nought — it is an unknown month, not a
cheap one, and averaging it in understates every suggestion in the one direction
that leaves a person planning too little.

A month no account was there for is **not** complete. "Every account is covered"
is vacuously true of no accounts, and without that guard every month before the
owner opened their first account would have qualified and dragged every mean
towards nought.

A closed account is not waved through either. Actual records that an account is
closed and does not record when, so "closed before the month began" is a fact
AYQ cannot establish, and §6.3 says to prefer excluding the month over
fabricating completeness.

## Starter taxonomy

Version 1 is provisioned in full on a budget AYQ creates, where Actual's
untouched placeholders are also removed. On a budget that already exists it is
one-time and strictly additive: missing names are created, a same-name category
is reused **where it already is**, and nothing is moved, renamed, merged,
deleted or reclassified. The marker is written only after every create has
returned, so an interrupted run is finished by the next launch and finishing it
twice produces nothing the first attempt already made.

Income uses Actual's own income group. `createCategoryGroup({ is_income: true })`
was measured and comes back with the flag off, so a second income group would
look right and behave like an expense group; `createCategory({ is_income: true })`
does work, and that is what is used.

Categories are created back to front, because Actual puts a new category at the
top of its group. Measured, not assumed, and pinned by a test that reads the
order back off the budget.

## About

A Settings tab, and no version or build number anywhere else in the product.
The revision comes from `git rev-parse HEAD`, the date from the clock at build
time, the version and build number from the manifest, the architecture from the
machine — all baked in by `ayq-build-info.mjs` as a compile-time constant, since
a packaged application's files live inside an asar and a stamp that can go
missing will. A build with no git to ask reports none of them and marks itself
as development.

`technicalInformation` is composed by the engine, in one function, out of a
fixed list of labelled fields. That is what makes §12.4 testable: two tests read
what comes out and require the safe fields to be there and a budget name, a
path, an account id, an IBAN fragment, a machine name, a counterparty, a
category and an amount not to be.

## What is deliberately not here

The task's §17 list, unchanged. And one thing inside the scope that could not be
done through a capability AYQ has: §11.3's "after version 1 is marked complete,
never recreate a starter category the owner later deletes **or renames**" is
proved on the rename half, because AYQ exposes no delete-a-category request to
call and adding one is outside this increment. The rule under test is the same
rule — the marker is what stops provisioning, not the shape of what the owner
did — and it is proved on the half that can be driven.
