# A2 Stage 1 — Fixed costs › Expected now (P2)

Governance: `AYQ_ANALYSES_A2_SPECIFICATION` r001; `AYQ_ANALYSES_DESIGN_SYSTEM`
r006 §4, §16; `A2_P2_HUMAN_PRODUCT_CHECKLIST` R002; directive
`A2_P2_IMPLEMENTATION_DIRECTIVE__CHATGPT_R002`. Every snapshot named here is
synthetic; no real banking data is, or may be, under this directory.

The installed-application results — PASS/FAIL per checklist check with the
screenshot numbers, the C1 contrast table and the H14 before/after pair —
are in `038_CLAUDE_CODE_REPORT__A2_P2` (AI_EXCHANGE / ACTIVE /
future-revision-2026-09-23 / OUTPUT). They are produced from the candidate
built from the commit that adds this file, so they cannot be inside it.

## The acceptance snapshots (checklist R002 §2)

`test/fixtures/a2/`, written by `build-fixtures.mjs` from literal invented
data; the producer's window-end dates and coverage facts are stated, never
computed. Test and acceptance fixtures only: the installer ships `dist/**` and
`package.json`.

| file | contract | what it holds |
|---|---|---|
| `s1-all-readings.json` | 1.1, judged 2026-09-15, produced 2026-09-16 | every reading and presentation: Missing (full coverage; the different-amount payment T21; an unresolved occurrence three months old), Not imported yet A / B / unknown start, Can't tell for both causes, Pending future / due today / open window, Arrived equal and different; a record with an old unresolved, an older and the latest Arrived, the next and a later future occurrence; a rescheduled occurrence shown on its moved date; an expected income, a suggested expense and a dismissed occurrence that must not appear |
| `s2-contract-1-0.json` | 1.0 | the same world as AYQ 0.4.0 wrote it — no 1.1 fact — with August money-out for Explore |
| `s3-no-confirmed-expenses.json` | 1.1 | only a suggested expense and an expected income |
| `s4-pending-and-arrived.json` | 1.1 | only Pending and Arrived rows |

What each reads as is pinned by `test/a2-fixtures.test.ts`: S1 shows 17
rows — Missing 3 · Not imported yet 3 · Can't tell 2 · Pending 6 · Arrived 3
— and none of the five items that must not appear; S2 is the older-snapshot
state; S3 the empty state; S4 Missing 0 · Not imported yet 0 · Can't tell 0 ·
Pending 3 · Arrived 2.

## Automated evidence in the suite

| file | proves |
|---|---|
| `test/fixed-costs.test.ts` | the capability gate (1.0 → older snapshot, never by product/build version); every reading in r001 §8 precedence, the three Pending and two Not imported yet presentations, both Can't tell causes, T17, T18, T21; the window boundary; visibility §9.4; order and counts; a viewer clock that throws changes nothing |
| `test/fixed-costs-view.test.ts` | the real components rendered to markup: one basis date, the exact summary with zeros, the attention tone on exactly the three names, every §16.5 sentence, Can't tell without an account, "Expected {amount}" only when it differs, the existing detail pane for Show transaction, the older-snapshot and empty states, the income line, no internal name |
| `test/conformance.test.ts` | the 25 r006 §16 sentences character for character, referenced by the view that draws them; the attention tone measured on every Fixed costs surface it is drawn on (C1) |
| `test/a2-fixtures.test.ts` | S1–S4 validate under the shared validator and read as above |

## Installed-application method

The candidate installer is built from the final head with `npm run package`,
installed per-user only while no AYQ Analyses process runs, and every launch
uses its own scratch `--user-data-dir` seeded with one of S1–S4 as the active
copy, so the owner's own store is never opened. Screens are captured at 100 %
device scale through the DevTools Protocol of that scratch instance. H14 is
checked by advancing the renderer's clock by three days (an injected `Date`
before a reload, and again after a relaunch) rather than by changing the
Windows date.
