# AYQ Analyses

AYQ Analyses is the read-only analytical companion to AYQ Personal Finances.

**Boundary:** AYQ owns the financial truth. AYQ Analyses interprets it.

> **Mandatory before work:** AYQ Analyses is a governed AYQ subproject. The
> files in `docs/` are bootstrap pointers only. Follow them to the current
> authoritative Drive governance, and read the current AYQ Canon before
> substantive work:
>
> 1. [`docs/00_COLLABORATION_MODEL.md`](docs/00_COLLABORATION_MODEL.md)
> 2. [`docs/01_PROJECT_WORK_INSTRUCTIONS.md`](docs/01_PROJECT_WORK_INSTRUCTIONS.md)
>
> Drive governance and current AYQ Canon are authoritative according to their
> ownership rules. GitHub pointer files, chat memory, handoff notes and cached
> text are not substitutes for the current Drive documents.

## What this increment implements — A1, counterparty analysis

A1 answers two of the Product Owner's own questions, end to end, from one
validated read-only snapshot:

- **Q1** — how much was spent at a given canonical counterparty over a stated
  period, and exactly which transactions compose that total;
- **Q6** — how far the data behind that result is reliable, per selected
  account, and exactly why coverage stops where it does.

Concretely:

- an independent Electron application (`eu.ayq.analyses`) with a sandboxed
  renderer: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`,
  and no renderer filesystem, Node, database or AYQ-store access;
- one snapshot chosen through the operating system's dialog in the main
  process; the renderer receives a typed, validated payload and no path;
- validation before analysis against the frozen r003 A1 input baseline; an
  invalid snapshot produces no analytical result and no partial screen;
- one analytical context — period, comparison, accounts, category — with metric
  fixed to money out and dimension to canonical counterparty;
- one engine result and one contribution set behind the headline, the rows, the
  chart, the exclusions, the drill-down and the comparison;
- coverage derived from the selected accounts, never from the global Forecast
  reliability boundary;
- exact money throughout: integer minor units to display digits, with no
  division anywhere in the display path.

## Deliberately not implemented

Overview, Fixed costs, Projection, Scenarios and Saved Analyses are present in
the rail and unavailable. There is no Search, no Explore preset row and no
snapshot archive: every launch begins at **No data loaded**, and the active
snapshot is session state. Currency conversion, the AYQ deep link and the
AYQ-side snapshot producer are out of scope.

## Development

```powershell
cd ayq\ayq-analyses
npm install
npm test
npm run typecheck
npm start
```

Build a Windows installer:

```powershell
npm run package
```

## Data safety

Only synthetic snapshots may be committed to GitHub or used in CI. Real banking
data must never be committed, or placed in CI artifacts, screenshots or logs.
Everything under `test/fixtures/a1/` and `evidence/a1/` is invented.
