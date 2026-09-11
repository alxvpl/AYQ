# Plan + Forecast — progress

The state of the Plan + Forecast work, kept here so a session that is
interrupted can be resumed from the repository rather than from a chat.

Design and the reasoning behind it: `AYQ_plan_forecast_architecture-r001.md` in
`AYQ_WORK` (working material, not authority). The proposed replacement text for
02 §5 and §7.1 is `AYQ_02_ARCHITECTURE_r003_PROPOSAL.md`, also in `AYQ_WORK`;
the canon file itself is not edited.

## Current stage

All eight stages complete, each with a green Windows run, and the result
brought into line with 03_DATA r004.

## Stages

| Stage | What it delivers | State |
|---|---|---|
| S0 | Baseline, investigation, architecture | done |
| S1 | Planned and recurring records | done |
| S2 | Available funds flag | done |
| S3 | Category monthly plan values | done |
| S4 | Forecast engine | done |
| S5 | Upcoming screen | done |
| S6 | Matching expected ↔ actual | done |
| S7 | Plan screen | done |

## The S0 checkpoint

S0 was the architecture checkpoint and contained no implementation of Plan +
Forecast. Its commit, `604311ddd`, changed this file and two README examples
and nothing else; every line of the feature was written in S1 onwards.

What it produced: the investigation of Actual 26.9.0 in Actual's own source and
by experiment, the map of what belongs to Actual and what must be AYQ's, the
rejected options with their reasons, the data model and the IPC members, and the
stage plan. All of it is in `AYQ_plan_forecast_architecture-r001.md`; the
technical answer to 02 §7.1 is in `AYQ_02_ARCHITECTURE_r003_PROPOSAL.md` as a
proposal, and the canon file was not edited.

The plan kept the stage order S1–S7 as given. The investigation gave no reason
to change it: S1 is the record every later stage reads, S2 and S3 are
independent of each other and both feed S4, and S5–S7 are the screens over the
top. Nothing in the plan differs from the stages as set, so there is no
divergence to record.

The questions that genuinely need the owner rather than an engineer are the
PROVISIONAL list below and the open items at the end. Everything else the
investigation raised was decided in code, against Canon.

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

## The provisional rules, now decided

The owner decided P1–P8 on 2026-09-11 and they are Canon: 03_DATA r004,
§7.10–§7.16. Nothing below is provisional any longer.

| Was | Now |
|---|---|
| P1 larger of plan and records, never the sum | §7.10, accepted as built |
| P2 detected expense counts, detected income does not | §7.12, accepted as built |
| P3 an overdue expense keeps counting, as due today, flagged | §7.13, accepted as built |
| P4 an account of unknown type counts toward funds | §7.15, accepted as built |
| P5 the budget's type is `tracking` | belongs to 02, not 03; untouched |
| P6 counterparty, exact amount, within seven days | §7.16, **and exactly one occurrence and one transaction qualify** |
| P7 an unmatched occurrence stops counting after 90 days | **rejected.** §7.13: nothing stops counting through time alone |
| P8 unaccounted plan at the start of its month, today for this one | §7.11, accepted as built |

### What changed in the code

**The 90-day cut-off is gone** (§7.13). `AYQ_OVERDUE_WINDOW_DAYS` and the tail
it cut are removed. An arrear counts until it is matched, rescheduled or
dismissed, whether that is ninety days or four hundred.

**Occurrences start where the decision was made** (§7.14). A record now carries
`confirmedAt` and `suggestedAt`, and produces occurrences from the later of its
start date and whichever of those its state calls for. This is what makes the
cut-off unnecessary rather than merely absent: a rhythm detected in two years of
statements used to arrive as two years of arrears, and the ninety days were
there to hide them. Now they are never generated, because they already happened.

Both dates are days, not instants, and both come from the day the engine was
asked about rather than from the wall clock — so a stated `today` states all of
it and the rule holds wherever it is exercised.

**Store version 4.** A version 3 record is given `confirmedAt` or `suggestedAt`
from its `createdAt`, whichever its state calls for, because version 3 confirmed
or suggested a record in the same act that created it. Reading does not rewrite
the file; the upgrade lands on the next write. A store from a newer AYQ is still
refused.

**An ambiguous match is never applied** (§7.16). Alongside the counterparty, the
exact amount and the seven days, a pair now has to be the only one of its kind:
exactly one occurrence and exactly one transaction qualifying. Two subscription
payments in one week, or one payment that could settle either of two months, are
offered and wait. Transactions already matched, and pairs a person has refused,
are not candidates and so make nothing ambiguous.

## Delivery numbers

A delivery number is a label on an installer that was handed to the owner, and
nothing more. It is not a version, not a tag and not a release: 06_RELEASE is
INCOMPLETE, and this does not settle any part of it. The application's own
version is untouched.

| Build | Commit | Run | What it carries |
|---|---|---|---|
| 001 | `f02b15392` | 54 | Plan + Forecast, stages S0–S7 |
| 002 | see below | see below | the same, brought into line with 03_DATA r004 |

The number lives in one place, the installer's file name
(`AYQ-build-002-windows-x64-setup.exe`, set by `artifactName` in
`ayq-desktop/package.json`). CI reads it back off the file it just produced and
names the artifact from that, so the two cannot drift, and a build whose
installer is not named for a delivery fails rather than shipping unlabelled.

## Known open defect, not this work's

**The Windows installer crashes intermittently in NSIS's integrity pass.**
Exit code `-1073741819` (`0xC0000005`), about two seconds in, on a silent
`/S` install. It predates this work and is not caused by it.

It was closed earlier in the project on nine consecutive clean installs, and
run 50 reopened it. Run 50 also diagnosed it: the same file installed cleanly
with `/NCRC` immediately afterwards, which skips the integrity pass and
nothing else. Run 29 said the same and run 34 contradicted it, so two of the
three diagnosed cases now agree.

Standing hypothesis: that pass reads all 117 MB in one go, and so does
Defender, which starts scanning the file the moment electron-builder finishes
writing it — about a second before the install step begins. The step now
waits for nothing else to hold the file and then fifteen seconds more, and
prints both numbers, so the next crash rules this out rather than leaving it
a maybe.

The gate is strict and stays strict: a crash is a red run. A green run means
the installer installed, not that it was worked around.

## What remains

- Nothing in 02 §7.2, 01 §6, 03 §3.2 or 06 is settled by this work, and the
  design keeps all of them open.
- The installer defect above.
