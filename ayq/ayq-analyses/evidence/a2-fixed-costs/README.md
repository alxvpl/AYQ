# A2 Stage 1 — Fixed costs › Expected now (P2)

Governance: `AYQ_ANALYSES_A2_SPECIFICATION` r001; `AYQ_ANALYSES_DESIGN_SYSTEM`
r006 §4, §16; `A2_P2_HUMAN_PRODUCT_CHECKLIST` R002; directive
`A2_P2_IMPLEMENTATION_DIRECTIVE__CHATGPT_R002`. Every snapshot named here is
synthetic; no real banking data is, or may be, under this directory.

The installed-application results are below, with the screenshots in this
directory; the full record is `038_CLAUDE_CODE_REPORT__A2_P2` (AI_EXCHANGE /
ACTIVE / future-revision-2026-09-23 / OUTPUT).

## Installed results (checklist R002 §3)

The candidate built from c8766e262, installed per-user, every launch over its
own scratch `--user-data-dir` seeded with S1–S4, 100 % device scale, the
application's own locale (en-GB here). The installed `app.asar`
(SHA-256 2F76246D…A54604A) is byte-identical to the one built from that
commit. Every check passed.

| check | fixture | result | screenshots |
|---|---|---|---|
| R1 — Fixed costs has the available rail treatment, never "Not in this version." | S1 | PASS | 08a, 08b |
| H1 — one basis date, "As of 15 Sept 2026" = meta.expectationsAsOfDate; no production-day line in the view | S1 | PASS | 01 |
| H1b — the explainer from the as-of line, word for word | S1 | PASS | 03 |
| H2 — five counts, fixed order, each equal to its group (3 · 3 · 2 · 6 · 3) | S1 | PASS | 01 |
| H2 / H3 — zeros shown, empty groups hidden (0 · 0 · 0 · 3 · 2) | S4 | PASS | 07 |
| H3 — group order; most recent first, Pending soonest first | S1 | PASS | 02a–02e |
| H4 — "Due today" | S1 | PASS | 02d |
| H5 — the open-window sentence; no "missing", "late" or promise | S1 | PASS | 02d |
| H6 — Missing names account and window end, whole period covered, hand-match line; never "not found" / "not paid" (T21 row) | S1 | PASS | 02a |
| H7a / H7b / H7c — presentation A; presentation B with no gap dates; unknown start is Not imported yet | S1 | PASS | 02b |
| H8 — the two Can't tell rows identical, no account field, no "No account" | S1 | PASS | 02c |
| H9 — paid date, amount, account; "Expected €120.00" on the different amount; Show transaction opens the existing pane; Escape closes it; Explore unchanged | S1 | PASS | 04 |
| H10 — 1.0: only the older-snapshot sentence; Explore works; no refusal | S2 | PASS | 05a, 05b |
| H11 — the empty sentence | S3 | PASS | 06 |
| H12 — "Expected income is not shown here." | S1–S4 | PASS | 01, 05a, 06, 07 |
| H13 — no Paid history anywhere | S1–S4 | PASS | — |
| H14 — renderer clock three days ahead, after a reload and after a relaunch: every status and the date unchanged | S1 | PASS | 09a, 09b |
| H15 — the question answered on the view (Gym membership: Missing; Phone plan: Not imported yet) | S1 | PASS | 02a, 02b |
| H16 — attention only on Missing, Not imported yet, Can't tell; Pending and Arrived uncoloured, not green | S1 | PASS | 01, 02a–02e |
| V1 / V2 / V3 — old unresolved, latest Arrived and next future only; no income, suggestion or dismissed; the moved date | S1 | PASS | 02a, 02d, 02e |
| C1 — attention tone contrast on every Fixed costs surface, at rest and hovered | S1 | PASS | — |
| K1 — no internal reading name or key rendered | S1 | PASS | — |

C1, measured from the computed styles of the installed window: the tone
`rgb(146, 85, 0)` (#925500) on the surface actually under it, `rgb(255, 255,
255)` — the Fluent provider's white, not the body ground — for the summary
names, the group headings and the row status names, each at rest and hovered
(no Fixed costs element has a hover, pressed or selected surface): 5.96:1 on
all 28 measurements. The conformance suite measures the same role on the white
surface and on the body ground (5.56:1 at #f6f7f9), the lowest governing.

A1 regression on the same installed candidate (the existing installed smoke):
the five A1 states, T1 (250 000 transactions to the headline in 6.0 s), T2
shared-prefix labels, the F1 boundary (211 rows drawn, 212 refused at 175 %)
and Periods A and B at 100 % and 175 % — all pass.

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
