# AYQ — Canon Router

**Status:** ACCEPTED repository bootstrap/router  
**Purpose:** Direct every AYQ session to the current authoritative AYQ Canon without creating a second Canon copy in GitHub

This file is **not** a Canon object and does not duplicate the Canon contents. The authoritative AYQ Canon is currently maintained in Google Drive under the rules of the current `00_INDEX.md`.

## 1. Mandatory rule

Before substantive AYQ product, architecture, data, design, integration, release, implementation, or review work, read the current AYQ `00_INDEX.md` and every Canon object relevant to the requested scope.

Do not rely on revision numbers remembered from chat, handoff notes, model memory, or this file. Verify the current Canon in Drive.

## 2. Current Canon location

AYQ Canon folder in Google Drive:

`11a8q9vMpMVlCLxawPp6L3BZ5Z3mO9ZXw`

Superseded Canon revisions:

`1dzO5TI4Fsxh-EmdwtJQtMNx2FQEnwhOU`

AYQ working material root:

`AYQ_WORK` — `1PWtDESBJVYHiuz7pvMTpy50TMFggoUTd`

GitHub source and implementation history:

`alxvpl/AYQ`

Notion is operational reference only unless the current Canon explicitly says otherwise.

## 3. Current Canon set

The current `00_INDEX.md` registers these Canon objects:

| ID | Stable file | Governing topic |
|---|---|---|
| 00 | `00_INDEX.md` | Canon object registry, authority order, ownership of topics, Canon change rules |
| 01 | `01_PRODUCT.md` | Product identity, intended user, scope/non-scope, standalone status |
| 02 | `02_ARCHITECTURE.md` | Runtime structure, process model, IPC, Actual boundary, local-first operation, engine/AYQ-owned logic boundary |
| 03 | `03_DATA.md` | Financial objects and ownership, import, deduplication, counterparty identity, integrity, Plan + Forecast, statement coverage/reconciliation, reversal/refund semantics |
| 04 | `04_DESIGN.md` | Accepted AYQ desktop design decisions and interface language |
| 05 | `05_INTEGRATION.md` | AYQ ↔ CIVION relationship and future AYQ-side integration contract |
| 06 | `06_RELEASE.md` | Product/build identity, schema numbering, branching, release production, upstream Actual intake, engineering discipline |

The table above is a navigation aid only. If it differs from the current Drive `00_INDEX.md`, the Drive Canon wins and this router must be corrected.

## 4. Authority order

The current AYQ `00_INDEX.md` defines the authority order. In summary:

1. newest explicit accepted decision of the Product Owner;
2. current Canon object;
3. verified implementation state in GitHub / CI;
4. working material in `AYQ_WORK`;
5. legacy and reference material.

A newer accepted owner decision that contradicts Canon requires the owning Canon object to be revised; both must not remain simultaneously in force.

## 5. Canon topic ownership

When Canon documents appear to overlap, the object that owns the question according to the current `00_INDEX.md` governs that question.

Do not create another authoritative document for a topic already owned by Canon.

If topic ownership is unclear, resolve it through the Product Owner and amend `00_INDEX.md` rather than inventing a parallel authority.

## 6. Working material is not Canon

Comparisons, evaluations, mockups, experiments, audits, session records, measurements, migration logs, prototypes, reports, temporary architecture variants, and implementation notes are working material unless explicitly promoted through the Canon process.

They may be evidence. They are not authority.

## 7. Subproject relationship

Subprojects may maintain their own specifications and working governance where AYQ Canon delegates or does not own the question.

For AYQ Analyses specifically:

- AYQ Canon remains authoritative for AYQ-owned financial truth and cross-project boundaries;
- Analyses-specific product/workflow/specification authority lives under `ayq/ayq-analyses/docs/`;
- Analyses must not silently redefine an AYQ Canon-owned concept.

For every AYQ Analyses task, additionally read:

- `../ayq-analyses/docs/00_COLLABORATION_MODEL.md`
- `../ayq-analyses/docs/01_PROJECT_WORK_INSTRUCTIONS.md`

## 8. Verification note

At the time this router was created, the verified Drive `00_INDEX.md` was revision **r007**, dated **2026-09-12**, with all Canon objects 00–06 registered as CURRENT.

This observation is historical verification, not a permanent pin. Always read the live current Drive Canon before work.
