# AYQ Analyses

AYQ Analyses is the read-only analytical companion to AYQ Personal Finances.

**Boundary:** AYQ owns the financial truth. AYQ Analyses interprets it.

> **Mandatory before work:** every Product Owner support agent, design/review agent, Claude Chat session, Claude Code session, or future implementation/review agent must read [`docs/00_COLLABORATION_MODEL.md`](docs/00_COLLABORATION_MODEL.md) before doing project work. That file is the authoritative collaboration and review protocol; chat memory is not.

This package is the first production-code bootstrap of the separate Windows application. It is implementation work, not a silent promotion of the working analytical contract or design notes into AYQ Canon.

## What this increment implements

- independent Electron application (`eu.ayq.analyses`);
- sandboxed renderer: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`;
- explicit JSON snapshot import only — no Actual SQLite, AYQ sidecar, Node or filesystem access from the renderer;
- local snapshot archive under Electron `userData`, written atomically;
- runtime contract guard for contract major 1 and the r003 invariants needed by the app;
- final working product rail: Overview, Explore, Fixed costs, Projection, Scenarios, Saved Analyses;
- Trends, Counterparties, Expected vs actual and Forecast history as Explore presets;
- Search and Reliability/Coverage as cross-cutting capabilities;
- canonical recurring boundary: Fixed costs starts from `expectationRecords` and matched `expectedOccurrences`, never transaction heuristics;
- canonical AYQ Forecast treated as sealed input; historical forecast backtesting is derived only from archived snapshots;
- evidence drill-down with date, amount, counterparty, account, category, transaction class, categorisation provenance and expected-match context.

## Deliberately not implemented yet

- direct AYQ/Actual database access;
- editing financial state;
- statistical Projection model;
- Scenario semantics;
- persistence model for Saved Analyses;
- AYQ deep link for `Open in AYQ`;
- final `ST_SPEND_CHANGE` materiality number. The working 40% dominant-category requirement is preserved, but the handoff does not contain the exact materiality threshold. The software therefore suppresses that statement instead of inventing a value.

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

Only synthetic snapshots may be committed to GitHub or used in CI. Real banking data must never be committed, attached to CI artifacts, screenshots or logs.
