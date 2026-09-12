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
| S5 | Today (04 A21) | done |
| S6 | Upcoming and Plan | done |
| S7 | Review and Settings | done |
| S8 | Reports destination | done — run 69 green |

## How the interface is being replaced

One screen at a time, not all at once. The application that exists works and
is proved by twenty acceptance steps on real Windows; replacing its whole
interface in one commit would take all of that down together and leave nothing
able to say which part broke.

So there was a seam: S2 turned the shell over and the screens that were still the
old ones were drawn inside the new frame until their own stage arrived. As of S7
there is no seam left — `ayq-legacy-views.ts` and every imperative renderer it
hosted are deleted, and so is the legacy CSS in `ayq-client.html`.

## Canon read again, and what it changed

The task named `03_DATA` r005. Drive holds **r006**, which is CURRENT and
supersedes it, so r006 governs. §7 and §8 are unchanged; §5.3–§5.8 are new, and
the repository did not satisfy them.

r006 says why in its own supersedes note: "The store has already been migrated on
a live machine (version 3 to 4) with no rule requiring a copy first, which is the
one way data here can be lost beyond recovery." That is the owner's own store, and
three more versions have been added to it in this session.

What was already true: the store is written atomically (§5.4), a store from a
newer AYQ is refused rather than read down (§5.6), and a migration decides
nothing (§5.7).

What was not, and now is:

- **§5.3 — the copy.** Before the shape changes, the store is copied to
  `ayq-store.before-v<from>-to-v<to>.json` and the copy is kept. A migration that
  could not first make its copy **does not run**: the read throws with the file it
  wanted and the remedy, and the window reports it the way it reports any store it
  could not open. Nothing here ever deletes a copy — "kept until the migrated
  store has been opened successfully at least once" is the floor, not the ceiling,
  and a few kilobytes is the cheapest insurance in this product.
- **§5.6 — one version at a time, in order.** `migrate` was one function that
  defaulted every field at once. It is now six named steps, 1→2 through 6→7, each
  handed the store as the previous version wrote it. Adding a version means adding
  one step rather than editing six defaults.
- **§5.8 — proved on a store of the previous version.** `test/ayq-store.test.ts`
  builds a store at each version from 1 to 6, migrates it, and asserts the record
  counts before and after, that the owner's own category decisions read back
  exactly as they were, that a manual match kept its provenance, and that running
  the chain again over its own output changes nothing (§5.5). Then: that the copy
  is made and is byte-for-byte the old shape, that an already-current store copies
  nothing, that a migration which cannot make its copy leaves the store untouched,
  and that reading an old store does not rewrite it — so an interrupted migration
  leaves a store that still opens.

One detail the copy rule needed: only a regular *file* counts as a kept copy. A
directory standing at that name is not a copy of anybody's store, and treating it
as one would let the migration run with no copy at all.

### A21's order, corrected

04 A21 says, in its own words: "Available funds is the first figure on the
screen... **The transaction list follows. Queues come last.**" Today was built
with the queues beside the forecast and above the list, which is what prototype
r009 shows. Canon governs: the order is now funds, how long it lasts, the
transaction list, then the queues. It is pinned by a renderer test that reads the
panes in document order, and by the Windows acceptance step, which reads the same
order off the drawn window.

## S8 — Reports (04 A2, A20)

Not built, and the screen says exactly that. Two things follow, and both are
checked rather than intended.

**It draws nothing that could be read as an answer** — no figure, no table, no
state chip, no chart — and the Windows step counts all four on a budget that
holds transactions, so "it drew nothing" is a decision rather than an accident
of there being nothing to draw.

**It asks the engine nothing.** An empty screen that has queried a budget looks
like a budget with nothing in it; an empty screen that has asked nothing can
only be read as a screen that has not been written. The renderer test asserts
the requests that crossed the bridge, and the only one is the window asking
which ground to draw in.

And it invents no reason. No history to accumulate, no threshold to reach,
nothing waiting on anybody. Both the test and the acceptance step refuse a list
of the sentences that get written when somebody fills an empty page — "not
enough", "insufficient", "at least", "more data", "come back", "once you have".
The only true reason is that the view is not built, and a screen implying a
person is at fault for it is worse than an empty screen.

It also records, where the question now lives, that AYQ had a Spending screen
before the accepted design and that the screen was removed: A20's rail has no
such destination, and its question — what has been spent, by category and over a
period — is this one. The engine still answers it, so nothing has to be rebuilt
when Reports is written. That removal is the owner's to overrule, and it should
be readable on the screen rather than only in this file.

`ayq-screens/ayq-not-built.tsx` is gone with it: Reports was the last
destination using it, and a component whose one job is to say "not built" is
better as the screen that has to say it.

### The delivery

`artifactName` names the installer for **build 003**. A delivery label and
nothing else: no tag, no release, no change to the version scheme.

## What fifty thousand transactions cost, and what was done about it

Run 66 got as far as the Register and measured its first draw at **17,008 ms** on
a budget of fifty thousand invented transactions, against a gate of 5,000 ms.
That gate has never actually passed: it was written in S3 and runs 62 to 65 all
failed before reaching it. So this is the first time the number has been read.

What it is now, measured by the screen itself on the same fixture and the same
kind of runner:

| | first draw | filtered |
|---|---|---|
| before, run 66 | 17,008 ms | — |
| **after, run 67** | **2,098 ms** | **1,042 ms** |

Both are inside the gate, and the gate did not move.

Three things were wrong, and all three were AYQ's rather than the runner's.

**The ledger fetched everything to draw a page.** An unfiltered Register asked
the database for every transaction — fourteen fields, three of them joins — and
then filtered, sorted and totalled fifty thousand rows in JavaScript to show five
hundred. Everything the filter asks except the counterparty is now a condition
the database can answer: account, dates, uncategorised, category, the size of an
amount as a pair of ranges, and the search as a `$like` over the payee, what the
bank printed, the notes and the category. The page comes back ordered and
limited, and the totals — which 03 §4.5 requires to be over the whole filtered
set and not over the page — come back as four aggregates. The counterparty is the
one question that still reads rows, because a canonical key lives in the AYQ
store and is not a column.

**The status bar cost a full scan on every launch.** `ayqSummary` read every
transaction to work out four numbers. Three of them are aggregates now. The
fourth, the uncategorised count, has to exclude transfers between two of the
owner's own accounts (03 §7.6) — which needs the store row by row — so the scan
is kept for the one case that needs it: a budget holding two or more of the
owner's accounts. A budget with one takes the cheap path. The counterparty count
is now taken from the store's own record of what AYQ resolved, which is both free
and a truer statement than counting a transaction AYQ never imported as a
counterparty of its own.

**Sixty seconds was the host's patience for any answer.** Importing fifty
thousand records legitimately takes minutes, so the window reported the import as
failed — twice — while the import carried on and succeeded. The timeout was there
to notice an engine that had died; a dead engine is now noticed the moment it
dies, because the host watches the child and fails every waiting request with the
reason. What is left is a last resort for an engine that is neither answering nor
dead, and it is fifteen minutes.

Two smaller things in the acceptance driver. It measured the Register while
already standing on it, so the screen never redrew and never published a
measurement — it now arrives from Reports, which asks the engine nothing, so what
is measured is the Register's own cost and not a queue behind another screen's
reading. And the Register step imported the same fifty-thousand-record file
twice, because importing twice is how duplicate protection is checked — a rule a
step of its own already proves on a small fixture. `--import-once` says what the
run actually wants.

### And then run 67 failed anyway, on the same screen

Not on the measurement. The Register now draws faster than the status bar's
summary comes back, and the acceptance run read the budget's size from the
summary — so it saw a zero and concluded the budget was empty, on a run that had
just imported fifty thousand transactions successfully. The count published for
the runs is the *Register's own* answer now, which is the number both checks
actually want, and the run waits for it to be the number the import said it would
be rather than merely non-zero. A speedup that makes a race easier to lose is
still a speedup; the race was always there.

Two smaller things from the same run. The engine's own stderr does not reach a
log under the `utilityProcess` host that ships, so a measurement taken inside the
engine was invisible in exactly the runs that wanted it — it is taken in the host
now, which is also the wait the renderer actually had and therefore the number a
slow screen is made of. And the step threw "the Register did not hold" over an
*import* failure, which sent the diagnosis to the wrong place; it prints the
verdicts and names what failed.

`AYQ_ENGINE_TIMING=1` makes the host print how long each request took. "The
Register took seven seconds" is not a fault anybody can act on; which request
those seconds were in is.

### Run 69: green, and what it delivered

The first run in this work to finish. Every step held, on real Windows
(build 26100), with Mica on the window:

| | |
|---|---|
| run | [69](https://github.com/alxvpl/AYQ/actions/runs/34710635239) |
| commit | `d50d84551` |
| the Register, on fifty thousand | first draw **2,123 ms**, filtered **1,061 ms** (gate 5,000 ms) |
| the whole launch, import included | 81 s |
| Today | available funds at 38px against the next largest at 28px |
| the shell | rail 64px, 9 destinations, 2 hairlines, one scroller |
| installer | `AYQ-build-003-windows-x64-setup.exe`, 118 MB |
| sha256 | `50cb89975a6f01104f17d00cba9d84c26ab1ec5b3ae70f02f46cac83b3db8e21` |
| artifact | `ayq-build-003-windows-installer` |

The installer was run silently, the installed application launched twice over one
directory, and what the first launch filed and planned the second launch still
had. The delivery number is a label on what was handed over: no tag, no release,
no change to the version scheme.

### And run 68, on the step that damages the store

Three defects, and the first is the one worth the run.

**The Register said the budget was empty before it had looked.** The table drew
its own empty state — "Nothing has been imported yet" — from the moment the
screen mounted until the engine answered. On a small fixture that is a flicker
nobody sees; on fifty thousand transactions it is a second of AYQ telling a
person their budget is gone. The acceptance step read the screen inside that
window and reported exactly that. There is no table now until there is an answer
behind it, and the table's own marker arrives with the answer — which is also
what a run waiting for the Register has always actually been waiting for. The
regression test holds the engine mid-answer and was proved to fail without the
fix; holding an answer required the stand-in engine to await what a test hands
back, so a screen's state before its first answer is testable at all.

**A reload took down a message nobody had dismissed.** The shell cleared every
notice each time its own read of the engine succeeded, and the rail reloads on
every move — so the damaged-store sentence, which the step deliberately provokes,
was gone as soon as the person clicked anything. The shell now takes down only
the failure it put up itself, by remembering what that was.

**A sentence was written into a component.** That damaged-store sentence lived in
`ayq-application.tsx`, joined out of three pieces around the file name, which is
an A24 violation of the plain kind. It is in the catalogue now. The A24 check did
not see it because it only ever looked at JSX: a string handed to a state setter
and drawn later is neither JSX text nor a JSX attribute. The check now reads any
whole sentence in a component — several words ending in a full stop, `+` chains
and template pieces reassembled first — and it found one real violation and
nothing else in the whole client.

One thing in the driver rather than the application: the wait for the Register
was sixty seconds, and now that the marker means "answered" rather than "drawn"
it is two minutes.

## S7 — Review and Settings (04 A6, A7; 03 §3.6, §4.1)

### The two decisions, kept apart on the screen and in the request

03 §4.1 draws a line this screen must not blur. "These are groceries" is a
statement about the transactions in front of a person. "Everything from this
shop is groceries" is a statement about every one that arrives from now on.

The engine could not express the first. `transaction.categoriseCounterparty`
wrote a rule and then applied it, so filing a counterparty and learning a rule
were the same call. It now takes `createRule`, and takes it as a *required*
field: a caller that did not have to say which would be choosing for the person,
and the type system now refuses one that has not. Filing without a rule is
`ayqFileCounterparty`, which sets the category on the counterparty's
transactions, records a person's provenance against each, and writes no rule —
so nothing about the next import changes.

One thing that rule does not say, and this had to decide: a transaction somebody
had already filed themselves, into something else. It is left exactly as it was
and counted separately, and the screen says so — "7 filed. 2 left as they were,
because you had filed them yourself into something else." Filing a counterparty
is a decision about the ones nobody has decided; it is not a licence to
overwrite decisions made one row at a time.

The acceptance step proves the distinction by its *consequence* rather than its
label: it files one counterparty and then reads Settings → Rules and requires it
to hold nothing, then learns a rule for the next one and requires that rule to be
there, keyed on that counterparty. A screen with one control doing both would
pass a check that read labels and fail this one.

### Review is transitional, and says so

The backlog is the counterparties AYQ has resolved that nobody has filed,
largest first — so one decision covers the most transactions it can, which is
what makes a queue shrink rather than a list somebody works through for ever
(A6). The screen states that in words.

The pane carries what it takes to decide: the names the bank actually printed, so
"AYQ thinks these are one shop" can be checked and corrected (03 §3.6), with each
variant saying whether it is here because a person said so or because the
statement did; the rhythm, when there is one; and the transactions themselves.

### Settings owns the categories, and says what it will not do

Settings → Categories is the only place a category is made or renamed. Two
consequences are printed on it rather than left to be discovered: renaming moves
the rules that file into it, because a rule keeps a category by name so that it
outlives a budget (§4.2) — the engine already did this, and now the screen says
it — and **AYQ does not archive or delete a category here**. Canon says nothing
about what should become of the transactions filed under one, and an irreversible
guess about somebody's history is the last thing this screen should offer. The
acceptance step reads both sentences off the window and fails if either is gone.

Settings → Rules is A7's four words, each one a test: visible (every rule, by the
counterparty it is keyed on), verifiable (a rule naming a category this budget
does not have files nothing, and is marked in the state colour that means
something is wrong), correctable (the category is changed on the Categories tab
and the rules move with it), reversible (a rule can be taken away, and the screen
says that what it filed stays where it is).

### The seam is gone

`ayq-legacy-views.ts`, `ayq-counterparties.ts`, `ayq-other-views.ts`,
`ayq-ui/ayq-legacy-screen.tsx`, `ayq-dom.ts` and `ayq-format.ts` are deleted, and
so is the block of legacy CSS in `ayq-client.html` — 199 lines of it. Every screen
is Fluent now; the page holds only the ground the window sits on before the first
paint. The import history was the last thing still drawn imperatively and is now
`ayq-screens/ayq-import-history.tsx`, which states what each import came to and
nothing about what was in it.

`ayq-counterparties.test.ts` went with its screen. What it proved is proved by
`ayq-review.test.ts`, against the screen that replaced it.

### No screen is keyed on the shell's reload count

A found defect, and a small one with a visible cost: Review said "7 filed, 2 left
as they were" and then discarded it, because filing bumped the shell's reload
count and the shell keyed the screen on that count — so React remounted it
mid-sentence. Every screen here reads the engine again by itself when its own work
changes something; the reload count belongs to the status bar, which is the
shell's.

### PROVISIONAL in S7

18. **Filing a counterparty leaves a hand-filed row alone.** §4.4 says a manual
    decision outranks automation and does not say what one person's later
    decision does to their earlier one. Leaving it, and saying how many were
    left, is the cautious and reversible choice.
19. **Settings → Categories does not archive or delete.** Stated on the screen
    with its reason. The owner may want it; it needs a decision about the
    transactions filed under an archived category first.
20. **The backlog is `counterparties.unfiled`, unfiltered by period.** The engine
    can take a period; Review asks for everything, because a backlog that hides
    last year's unfiled shop is a backlog that lies about how much is left.

## S6 — Upcoming and Plan (03 §7, 04 A8, A9)

Two screens over one record set (A9), and the seam between them is where the
work was. Upcoming is the time-based projection; Plan is the monthly frame.

### The table on Upcoming is the forecast, not the record list

That is the decision the rest of the screen follows from. The forecast is the one
place the running position, the overdue flag and §7.10's "the larger of, never
their sum" are worked out, so drawing anything else here would be a second
arithmetic that could disagree with Today's counts and with the Plan sheet.
Records are read beside it, in the pane, where they are edited.

It has one consequence worth stating: a row can be the unaccounted part of a
category's plan (§7.11) rather than a record. Such a row has nothing to act on,
and the pane says which it is and points at Plan, rather than offering buttons
that would do nothing.

A dismissed occurrence is not in the forecast — that is what dismissing does —
and it is drawn anyway, from the plan, with "not counted" where the position
would be. A decision a person cannot see is a decision they cannot undo.

### Every action says what it reaches (§7.17)

The pane has two blocks, marked and labelled in words: *this occurrence only* —
move, dismiss, unmatch — and *the whole record* — edit, accept, put away, remove,
end the series. Ending a series is its own action and is never what dismissing
does; a single payment is offered no such action at all, because it has a date
and not a rhythm and nothing over it may reach beyond itself. All of that is
asserted twice: in the renderer tests and, on the packaged application, by
reading the two blocks off the window.

### Matching waits for a person (§7.16)

Opening Upcoming runs the matcher, which applies only what nothing about could
be in doubt and offers the rest. Each offer states what was expected, what
happened, and what the two have in common in words — so agreeing to it is
informed rather than blind. Agreeing and refusing send exactly that decision and
nothing else, which the tests check by the *keys* that crossed the boundary.

### The Plan worksheet

Categories down, one month across: planned, actual, left, still expected. Every
figure is the engine's; the screen adds nothing up. "Still expected" is the
larger of what is left of the plan and the records expected in the category
(§7.10), and the rule is printed under the sheet, because a column a person
cannot reconstruct is a column they cannot trust.

A cell shows the engine's figure until an edit is committed, and a plan that has
not changed is not written again. A month outside the range the budget can be
planned in has no cell to type into and says so, rather than refusing when it is
used.

### The seam is nearly gone

`ayq-upcoming.ts` and `ayq-plan-view.ts` are deleted, and `ayq-legacy-views.ts`
now carries three views instead of five. S7 takes the rest.

### Three defects this stage found, two of them serious

**The engine opened a budget more than once.** `openBudget` set its guard only
once the budget was loaded, so two requests arriving together both found no
budget and both created one — two budget directories, a SQLite "table payees
already exists", and a window reporting an unknown problem opening a budget it
had just made itself. It became reachable the moment the renderer became a React
shell that asks several questions at once, which is the right thing for a
renderer to do. **This is what runs 61 to 65 were failing on**: run 64 hung
before it could say so, and run 65 said it in one line. The first request now
opens the budget and the rest wait on that same open, and a test fires four
requests at a fresh engine and requires one budget directory — it fails with the
runner's own error message when the guard is removed.

**React was loaded without a document, so no text input worked.** `react-dom`
decides at load time whether the browser has an `input` event, by reading the
global `document`, and caches the answer for the process. The renderer tests
created their window *after* importing the components, so React concluded there
was no `input` event and fell back to a polyfill watching `keydown` and
`selectionchange` — and `onChange` never fired for a text input, however the
value was set. Every other handler worked, which is why it looked like a quirk
of one control. `build-tests.mjs` now bundles each test from a shim that loads
`test/ayq-dom-first.ts` first; typing is testable, and the form tests that
needed it pass.

**`onBlur` is `focusout`.** A dispatched `blur` reaches the element and nothing
else, because `blur` does not bubble and React listens for `focusout`. Both the
harness and the acceptance driver dispatch `focusout` now.

A fourth, smaller: the Upcoming acceptance step used to return one string and the
caller decided whether it was a failure by testing it against a list of prefixes
— so a failure nobody had thought to list passed as a screen dump. It returns a
verdict and a dump, and the caller reads the verdict.

### Typing into a React control, from outside

Worth recording because it is not obvious and it bit both the tests and the
acceptance run. React keeps the last value it saw on the element itself and
ignores an event whose value matches it, so assigning `element.value` updates
that cache as well and the change is swallowed — in a real browser as much as in
a test. The value has to be written through the *prototype's* setter, which is
what a person typing does. The acceptance driver and the test harness both do
that now.

### PROVISIONAL in S6

14. **The waiting matches sit above the forecast table.** A5 puts what requires
    action first on the dashboard and says nothing about Upcoming; these are
    decisions waiting on a person, so they are above the projection they would
    change.
15. **Opening Upcoming runs the matcher.** §7.16 says matching runs after every
    import and may apply only what is beyond doubt; it does not say when else.
    Opening the screen that shows what is expected is the other moment a person
    would expect it to have looked, and Today already does the same to count
    what is waiting.
16. **A dismissed occurrence is drawn with "not counted" beside it.** §7.13 names
    dismissal as one of three ways to deal with an overdue occurrence and does
    not say whether it can be undone. Drawn, and reversible, is the cautious
    option.
17. **The record editor's fields, and their order.** 04 r002 does not specify a
    form. These are the fields `AyqPlanDraft` carries and nothing more.

## S5 — Today (04 A21)

Three questions answered from one reading of the budget: what you have, how
long it lasts, and what is waiting on you. One engine request, `today`, answers
all three — because a screen that asks four questions is a screen whose four
answers can disagree, and then a person has two numbers for the money and no
way to tell which one it is.

Available funds come first and are the largest figure on the screen, with the
accounts beside them — every account, with the ones that do not count toward
funds drawn as not counting rather than left out. Under the money, and not on
another screen, the reliability boundary: the earliest date the counted
accounts' statements reach (03 §8.4), in words, with Accounts and Import both
reachable from that line (A20).

Then how long it lasts — the forecast's own lowest point and its own figure for
the end of this month, taken from the forecast rather than computed again here
— and then what is waiting on you: overdue expected payments and what they come
to, matches offered, transactions with no category, suggested records, and
counterparties with nothing filed. A queue with nothing in it is not drawn as a
line saying zero (A5); it is simply not there, and when none of them has
anything in it the panel says so.

Last, the latest movements, drawn by the same ledger pane the Register uses —
extracted into `ayq-screens/ayq-ledger-pane.tsx` for this stage, so the two
screens share one table rather than two that drift apart.

### Counted, never stored

Every figure on Today is the engine's, and every count is counted when it is
asked for. Nothing about the queues is written down: a queue length that is
stored is a queue length that can be wrong, and being wrong about how many
decisions are waiting is the one thing a screen of pending decisions must not
do. The overdue count is taken off the forecast's own `flagged` events (03
§7.13), so Today and Upcoming cannot come to disagree about which payments are
late.

The engine tests prove that rather than assert it: Today's available funds,
total, coverage and boundary are compared against what `accounts.view` answers
for the same budget, its lowest point and month end against what `forecast`
answers, and its uncategorised count against the rows the Register holds — and
then one transaction is filed and Today's count is required to have dropped by
exactly one. A planned payment is saved, is *not* overdue on the day it is due,
and is overdue a month later with its amount stated.

### Measured on the window, not read off the stylesheet

The Windows acceptance step (`--today`) opens Today on the packaged
application and measures the drawn page: the computed font size of the
available-funds figure against every other figure on the screen, and its
position against the first of the panels below it. "First, and the largest
figure" is a rule about what a person sees, and a stylesheet that was meant to
carry it is not evidence that it did. The step also fails if the boundary line
is absent, if Import cannot be reached from Today, if a queue with nothing in
it is drawn anyway, or if the waiting total and the lines drawn do not come to
the same number.

### Two defects in the acceptance driver, found by running it

Run 64's `Tests` step was green — the engine suite passes on Windows — and the
very first smoke step then spent its whole ten minutes and failed, having
produced no screenshot and no verdict. Both defects behind that are in the
driver, not in the application.

**An injected script that did not parse.** `executeJavaScript` takes a string,
and the driver writes those strings as template literals — so `\n` and `\s`
inside one are read by TypeScript and not by the browser. `rows.join('\n')`
compiled to a single-quoted string with a real newline inside it, which is a
SyntaxError in the window; seven other places wrote `replace(/\s+/g, ' ')`,
which compiled to `/s+/g` and silently deleted the letter s from whatever the
screen had said. Ten sequences are escaped properly now, and
`test/ayq-smoke-scripts.test.ts` reads the built driver back, hands every
injected script to the parser, and separately refuses `/s+/`. It is shown the
mistake it exists for and required to fail on it.

**A run that failed by hanging.** The injected script threw, the promise
rejected with nothing awaiting it, `runSmoke` stopped where it stood, and the
window stayed open until the CI step's own limit killed it — ten minutes to
learn nothing. It is caught now: the reason is printed and the run exits
non-zero, which is what a failure is for.

### What A22 costs when a pane is taller than the window

The shell acceptance step measured the detail pane 49px above the top of the
scroller and called it scrolled away. It had not: the pane is 758px tall in a
729px scrollport, and a `position: sticky` element taller than the scrollport
has nowhere to stick — the browser holds it by the foot of its own column
instead, which is exactly 49px up.

Nothing is changed to make that go away, because both ways out are worse than
the fact. Giving the pane its own scrollbar is what A22 forbids; capping its
height would need a threshold Canon does not give. So the step now requires
what is true in both cases — that the pane never grows a scrollbar of its own,
and that when it is too tall it sits precisely where the foot of its column
leaves it and not a pixel higher — and prints which case it measured. On a
taller window the strict case applies and the pane is required to be at the top
of the scroller.

### PROVISIONAL in S5

12. **The waiting list's order** — overdue, matches, uncategorised, suggested
    records, counterparties. A21 names what is waiting on you and does not
    order it. This is most-urgent first, and "overdue" is the only one of the
    five that is late rather than merely pending.
13. **Today shows the latest movements at the bottom.** A21 names the three
    questions and not a fourth panel. It is the Register's own pane, drawn
    unfiltered and reachable in one action, and it is here because a person who
    has just imported wants to see that the rows arrived.

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
