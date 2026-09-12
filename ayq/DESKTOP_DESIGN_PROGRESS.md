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
| S3 | Register: table and detail pane | not started |
| S4 | Accounts, coverage and reconciliation (03 §8) | not started |
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
