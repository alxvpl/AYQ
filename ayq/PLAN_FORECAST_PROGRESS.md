# Plan + Forecast — progress

The state of the Plan + Forecast work, kept here so a session that is
interrupted can be resumed from the repository rather than from a chat.

Design and the reasoning behind it: `AYQ_plan_forecast_architecture-r001.md` in
`AYQ_WORK` (working material, not authority). The proposed replacement text for
02 §5 and §7.1 is `AYQ_02_ARCHITECTURE_r003_PROPOSAL.md`, also in `AYQ_WORK`;
the canon file itself is not edited.

## Current stage

S1 complete. S2 next.

## Stages

| Stage | What it delivers | State |
|---|---|---|
| S0 | Baseline, investigation, architecture | done |
| S1 | Planned and recurring records | done |
| S2 | Available funds flag | not started |
| S3 | Category monthly plan values | not started |
| S4 | Forecast engine | not started |
| S5 | Upcoming screen | not started |
| S6 | Matching expected ↔ actual | not started |
| S7 | Plan screen | not started |

## Decisions taken

Measured against Actual 26.9.0 at the pinned baseline, in its own source and by
running it. The full evidence is in the architecture document; the decisions are:

1. **Actual's `forecast/generate` is not used.** It exists and is reachable, and
   it models none of 03 §7 — no available-funds flag, no confirmation rule for
   expected income, no unused-plan remainder, no state, no provenance, no match
   to an actual transaction. The forecast is AYQ's own, as 04 A11 anticipated.
2. **Actual's schedules are not used, and AYQ creates none.** A schedule created
   through `@actual-app/api` carries no category, and `importTransactions` links
   imported transactions to a matching schedule by itself — a decision with no
   provenance, which 03 §4.3–§4.4 forbid.
3. **Planned and recurring records, occurrence states, matches and the
   available-funds flag live in the AYQ store**, `ayq-store.json`, version 3.
4. **The per-category monthly plan lives in Actual**, in a *tracking* budget.
   Measured: in tracking mode a category's monthly balance is `budgeted + spent`
   for that month alone and does not carry into the next, which is 03 §7.8
   exactly. Envelope arithmetic is what 01 §4 and 04 A8 say AYQ does not do.
5. **The available-funds flag is AYQ's own, not Actual's `offbudget`.**
   `offbudget` also decides what Actual counts in a budget month, which the Plan
   screen reads; one flag with two meanings is how a figure comes to be wrong in
   a way nobody can trace.

## PROVISIONAL

Each is isolated in one named function or constant, and each is for the owner to
confirm or overrule.

| # | Decision |
|---|---|
| P1 | Expected expense for a category is the larger of the plan remainder and the sum of its expected records, never their sum. Records with no category count in full. |
| P2 | A detected expense that has not been accepted counts as expected expense; detected income does not count until accepted. |
| P3 | An expected expense past its date without a match keeps counting, as due today, and is flagged. |
| P4 | Every account defaults to "counts toward available funds" = yes, because neither Actual nor the CAMT record carries an account type. |
| P5 | The budget's type is set to `tracking`, on creation and on opening an older budget. |
| P6 | A match is applied automatically only when the counterparty or mandate agrees, the amount is exact, and the date is within seven days. Anything less is offered and waits. |

## What remains

- S1 through S7, each ending on a green Windows acceptance run.
- Nothing in 02 §7.2, 01 §6, 03 §3.2 or 06 is settled by this work, and the
  design keeps all of them open.
