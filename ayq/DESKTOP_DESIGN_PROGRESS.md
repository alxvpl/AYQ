# The accepted desktop design, brought into the application — progress

The state of the work that builds `04_DESIGN` r002 (A1–A24) and `03_DATA` r005
(§7.17, §8) into AYQ Desktop, kept here so a session that is interrupted can be
resumed from the repository rather than from a chat.

`PLAN_FORECAST_PROGRESS.md` beside this file belongs to the Plan + Forecast
work and is left as it is.

Canon is on Drive and is not edited from here. Prototype r009 is evidence of
intent, never authority: where it and Canon differ, Canon governs and the
difference is recorded below.

## Stages

| Stage | What it delivers | State |
|---|---|---|
| S1 | Fluent UI React v9 and the token module, alone | done |
| S2 | The shell — rail, grounds, status bar, screen frame | done |
| S3 | Register: table and detail pane | done |
| S4 | Accounts, coverage and reconciliation (03 §8) | done |
| S5 | Today (04 A21) | not started |
| S6 | Upcoming and Plan | not started |
| S7 | Review and Settings | not started |
| S8 | Reports destination | not started |

## How the interface is being replaced

One screen at a time, not all at once. The application that exists works and
is proved by twenty acceptance steps on real Windows; replacing its whole
interface in one commit would take all of that down together and leave nothing
able to say which part broke.

So `ayq-fluent-mount.tsx` is a seam: the shell that exists draws the screens it
has always drawn, and a screen that has been brought over to Fluent is mounted
into the same element as a React root. S2 turns the shell itself over, and the
screens that are still the old ones are drawn inside the new frame until their
own stage arrives. By S8 there is no seam left and the file goes.

## S4 — Accounts, coverage and reconciliation (03 §8)

Per account: the balance, whether it counts toward available funds, how far its
statements reach, and whether AYQ agrees with the closing balance the bank
stated there. Then a detail pane that says the difference in figures and says,
in words, what AYQ is *not* claiming.

Everything about reconciliation is derived on read (§8.5). There is no
reconciliation record in the store, no provenance, and nothing on the screen to
accept, dismiss, adjust or mark as done — which is checked rather than
promised: the acceptance run and the renderer test both fail if a button with
any of those words appears in the pane.

A difference is stated and left standing (§8.3). AYQ does not adjust a balance,
create a balancing transaction or write anything into the ledger, and the
engine test proves it by counting the ledger before and after a statement whose
closing balance assumes movements AYQ has never been given: the budget gains
exactly the one entry that statement carried, and the account's balance moves
by that entry and by nothing else.

AYQ also asserts nothing beyond the comparison (§8.2). The pane says the two
disagree by this much; it does not say which statement is missing, and it says
so out loud.

### The reliability boundary (§8.4)

The *earliest* coverage date among the accounts that count, never the latest —
and a counted account with no statement at all leaves no date to rely on rather
than borrowing another account's. Both are tested, in the engine and on the
screen, because taking the latest is the mistake that looks right.

### The store

Version 7 keeps, per account, the date its statements reach to and the closing
balance the bank stated there, with the file it came from. Only a statement
that moves the boundary forward is recorded: importing 2021 after 2026 must not
make AYQ know less. An older store gains an empty one, which is the truth about
it — nothing was recorded at import time, and deriving it from the ledger now
would be AYQ agreeing with itself.

### Settings

Settings → Accounts keeps the "counts toward available funds" switch and
nothing else, and points at this screen for the rest. The renderer test asserts
the column list, so a balance or a coverage date creeping back into Settings
fails rather than passing unnoticed.

### PROVISIONAL in S4

11. **Coverage is per account and per import**, taken from the furthest
    statement seen. 03 §8.1 says an account records how far its statements
    reach; it does not say what to do when one import carries several accounts,
    and the importer does not yet produce that case.

## S3 — Register: table and detail pane

The pattern every other screen reuses, so most of the work is components
rather than a screen: `ayq-ui/ayq-table.tsx` decides once that a header sticks
to the top of the screen's scroller, that a row a mouse can choose a keyboard
can choose, that focus is visible and that a column of figures is right-aligned
with tabular numerals (A19). `ayq-ui/ayq-filter-chips.tsx` decides once that a
filter in force is a chip that says what it is and can be taken off on its own.

The table has the accepted columns, a search field, and filters on period,
account, category, amount and uncategorised. What is filtered is shown and
removable, one at a time or all at once, and the totals say in words which set
they are describing — "these totals describe the 412 transactions this filter
matched, not everything AYQ holds". Uncategorised is a chip in its own state
colour rather than an empty cell, and the engine counts those transactions in
every total and says how many of them there are (03 §4.5).

The detail pane carries what a person needs to judge a row: the evidence the
resolver decided on, the category and who put it there, whether the
transaction turned out to be a payment that was expected, and every decision
anybody has made about it. Then the three actions — change the category,
correct the counterparty, show the rule.

### What the engine gained

- The filtered set's totals, computed over everything that matched rather than
  over the page, so a screen showing five hundred of fifty thousand still
  states the truth about the fifty thousand.
- A filter on the size of the amount, ignoring direction: "the large ones" is a
  question about size, and a large payment in is one of them.
- **Store version 6.** A transaction's category decisions are a history, oldest
  first, the last being the one that stands. Version 5 kept one, which is a
  history of one and becomes exactly that. Bounded at twenty: it is a record of
  a small argument, not a log.
- The detail carries the canonical counterparty key, the standing rule for it
  (04 A7) and the expected payment it was matched to — the last read off the
  occurrence rather than stored twice (03 §7.16).

### Performance

Measured on the Windows runner against fifty thousand invented transactions,
by the screen itself: from asking the engine to the frame that has the rows on
it. Both the first draw and a filter applied afterwards are printed by the run
and required to be there, and the gate is five seconds — deliberately generous,
because it is a shared runner and the number worth reading is the measured one.
The run prints it as `register performance: N transactions held, first draw
Nms, filtered Nms`.

### Two defects this stage found in CI itself

Neither is S3's, and both were costing more than any of the code.

**A step of two commands only ever checked the second.** PowerShell is the
default shell on these runners and does not stop on a failed external command;
only the last exit code reaches the runner. The engine suite had been failing
since the store went to version 5 — five assertions in it name the version as a
literal — and the Tests step passed anyway, on the renderer suite that ran
after it. Every line is now checked by name, and those assertions read
`AYQ_STORE_VERSION`.

**The acceptance measured a screen before it had redrawn.** Choosing a row asks
the engine; the pane was measured in the same breath and was reported missing.

## S2 — The shell

The window is React's now, top to bottom: a 64-pixel rail with the nine
destinations of A20 in three hairline-separated groups and Settings at the
foot, no top panel, a status bar with no version number on it, and a screen
frame with exactly one scroller whose scrollbar is at the window's right edge.

The screens that have not had their own stage yet are drawn inside that frame
by the renderers that always drew them (`ayq-legacy-views.ts`), so Register,
Upcoming, Plan, Import and the Rules list keep working and keep their
acceptance while each waits its turn. Today, Accounts and Reports say plainly
that they are not built; Review says the same and shows the counterparties
surface under it, because that much of it exists.

What the Windows run measures rather than looks at: the rail's width and the
order of its destinations against `ayq-destinations.ts`, two hairlines falling
between the three groups, Settings last, the wordmark reading AYQ, every
destination a real button that is in the tab order, one scroller, its right
edge within two pixels of the window's, and a status bar with nothing in it
that reads as a version. Then nine hundred rows are scrolled and the table
header has to still be at the top of the scroller and the detail pane still
beside the row it describes (A22).

### Mica and Acrylic (A14), verified rather than claimed

`backgroundMaterial` is Electron's way to ask Windows for Mica, and it needs
Windows 11 — build 22000. Below that Electron accepts the option and Windows
does nothing with it, which is the worst of the three outcomes: a product that
says it uses Mica and does not.

So the build number is read at window creation, the material is set only where
it can be honoured, and what the window actually got is printed and required by
the run. GitHub's `windows-latest` is Windows Server 2022, build 20348, so what
CI exercises is the fallback: the solid ground the token module defines. Mica
itself will first be seen on the owner's own Windows 11 machine.

Acrylic is for transient surfaces only and AYQ has none yet — no flyouts, no
menus. Nothing claims it.

### What the accepted design removes

**The Spending screen is gone.** It had a workspace of its own before the
design was accepted; 04 A20's rail has no such destination, and the question it
answered — what the money went on, by category — belongs to Reports, which S8
states plainly is not built. The engine's `spending` request is untouched and
still answers; what is gone is the screen and the acceptance step that drove
it. This is a capability the branch had and build 003 will not, and it is here
rather than in a footnote because it is the owner's to overrule.

**The Recurring screen is gone** for the same reason: no destination in A20,
and what it showed is what Upcoming and Plan show from the same records.

### PROVISIONAL in S2

6. **Settings has an Appearance tab.** A23 makes the ground the owner's
   setting and does not say where the choice is made; Settings is where a
   setting lives, and the prototype's Settings has three tabs that are not it.
7. **The status bar carries no version at all.** A20 says "no version number",
   so the engine's version and the store's schema version — which the prototype
   showed — are not there either. Both are still in the engine's answer.
8. **The rail shows each destination's name under its icon.** A20 fixes the
   width and the order and not this; a rail that has to be hovered to be read
   is a rail nobody reads.
9. **The Register reads a page at a time and offers the next one.** 04 is
   silent on paging; the engine answers five hundred rows and the screen says
   how many of how many it is showing, with one action for more.
10. **The amount filter is on the size of the amount**, ignoring direction.

## S1 — Fluent UI React v9 and the token module

`ayq-tokens.ts` is the only source of colour, metric and type. Fluent's own
components read Fluent's tokens, which `ayq-theme.ts` fills from that module;
AYQ's own components read the same values as custom properties. One set of
values, two consumers.

The accent is one constant. Its hover, pressed, focus, soft and line
derivations are computed from it, per ground — so changing the palette is one
edit, which is what the stage asked for. The prototype's hand-tuned values are
within a few units of the computed ones and are evidence rather than Canon:
A16 fixes the accent and names the derivations without giving them values.

What is checked, in `ayq-tokens.test.ts` and `ayq-strings.test.ts`:

- every filled accent surface carries its foreground at 4.5:1 or better —
  the worst is the pressed accent fill at 5.00:1;
- white on filled mint is 1.92:1, which is why it is never used (A18);
- the accent scale and the state scale share no value, and no state tone comes
  within 45° of the accent's hue;
- CIVION's identity green appears nowhere, as a value or as a derivation;
- both grounds define the same complete token set, and every state chip reads
  at 4.5:1 or better;
- no `.tsx` file holds a user-facing string — the check parses the syntax tree
  rather than searching the text, and is itself shown a component that breaks
  the rule and one that keeps it.

`ayq-appearance.test.tsx` exercises the screen in a real window: the three
grounds are chosen through the control a person uses, the choice reaches the
engine, the ground the engine kept is the one the window opens in, and
"follow the system" follows the system when it changes.

On Windows, two acceptance steps: the grounds on the screen and the ground
outliving the process, both on the working tree and again on the installed
build. Each requires the words the check prints rather than a zero exit code.

### The store

Version 5 adds the interface settings. A store from any earlier version gains
the default, which is to follow the system — the same as never having been
asked, which is what happened.

### PROVISIONAL in S1

Listed for the owner to confirm or change. Each is in one place.

1. **The state scale's values.** 04 r002 names the five states and fixes no
   value for any of them.
2. **Confirmed is blue, not green.** A17 in particular: the accent is a mint
   green, and the prototype's green "confirmed" sits twelve degrees of hue from
   it — close enough to read as something the accent has marked. Blue is
   ninety-five degrees away.
3. **Uncategorised has a tone of its own** rather than borrowing neutral's. It
   is a valid state (03 §4.5), and "nobody has filed this" is not the same as
   "there is nothing to say about this".
4. **Density, spacing, radius and the type scale** — `AYQ_METRIC` and
   `AYQ_TYPE`. Not decided by 04 r002; these are what the work needs.
5. **The interface locale is `en-GB`.** English ships (A24), and the catalogue
   names the locale it formats in, so adding Dutch moves the words and the
   number and date formats together. Amounts in AYQ's own screens therefore
   read `€1,978.45`. The screens that have not been brought over yet still
   format as they did.

### Known, and not this stage's

`esbuild` 0.24.2 carries a moderate advisory about its development server,
which AYQ does not run. Changing it is a major version bump across three
packages and belongs to its own change, not to this one.
