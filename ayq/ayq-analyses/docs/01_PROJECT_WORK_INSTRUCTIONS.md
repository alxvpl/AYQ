# AYQ Analyses — Project Work Instructions

**Status:** ACCEPTED  
**Authority:** Mandatory project operating instructions  
**Applies to:** Product discussion, research, specification, architecture, implementation planning, implementation, review, verification, and documentation work on AYQ Analyses

This document defines the general operating rules for work on AYQ Analyses. Role ownership, peer-review responsibilities, acceptance ownership, and the meaning-vs-behavior boundary are defined separately in [`00_COLLABORATION_MODEL.md`](00_COLLABORATION_MODEL.md). Both files are mandatory.

## 1. Project

AYQ Analyses is an independent, local-first Windows desktop application and a read-only analytical companion to AYQ Personal Finances.

The governing product boundary is:

> **AYQ owns the financial truth. AYQ Analyses interprets it.**

AYQ Analyses must not become a second bookkeeping system, a second owner of canonical financial state, or a hidden replacement for AYQ domain logic.

It may own non-financial analytical state explicitly assigned to it, such as saved analytical views, scenarios, snapshot archive metadata, and UI preferences, when those behaviors are specified and accepted.

## 2. Communication

- Communicate with the Product Owner in Bulgarian unless another language is explicitly requested.
- Be direct, precise, and operational.
- Do not require the Product Owner to translate implementation jargon into product meaning.
- When requesting an action from Claude Code or another implementation agent, provide a bounded, paste-ready implementation package rather than vague guidance.
- Distinguish verified facts, accepted decisions, working assumptions, and open questions.
- Do not present inference as verified project state.

## 3. Authority and source order

The Product Owner is the final authority for AYQ Analyses.

For project work, use this order of authority:

1. the Product Owner's newest explicit decision;
2. current authoritative AYQ Analyses repository documentation;
3. current applicable AYQ Canon / integration contracts referenced by the AYQ Analyses documentation;
4. verified repository state, source code, tests, CI, and runtime evidence;
5. working documents and prototypes;
6. prior chat history, handoff notes, model memory, and legacy material.

Lower levels must not silently override higher levels.

If two authoritative repository documents conflict materially, stop work in the affected scope, identify the conflict, and resolve it before implementation continues.

## 4. Mandatory pre-work loading

Before substantial work, every participant must:

1. read [`00_COLLABORATION_MODEL.md`](00_COLLABORATION_MODEL.md);
2. read this file;
3. read the current repository specifications relevant to the requested scope;
4. inspect the current repository/branch state when the task concerns implementation or verification;
5. identify applicable `ACCEPTED`, `WORKING`, `OPEN`, `REJECTED`, and `SUPERSEDED` decisions;
6. verify that the requested action is authorized by the execution gate below.

Do not rely on model memory or previous chat summaries when current repository documents are available.

External records in Google Drive, Notion, handoff notes, or chat may be useful historical or supporting material, but they are not the authoritative AYQ Analyses specification unless the repository explicitly imports or references them as such.

## 5. Execution gate

Discussion, analysis, brainstorming, criticism, or design exploration does not by itself authorize repository changes or implementation.

Implementation, structural repository changes, durable documentation changes, integration changes, migration work, or destructive actions require explicit Product Owner authorization for the applicable scope.

"Continue", "proceed", or equivalent wording counts as authorization only when the scope is already unambiguous from the current work package.

Do not expand an authorized increment merely because adjacent work appears useful.

If an implementation would require an unresolved product decision, follow `00_COLLABORATION_MODEL.md`: do not invent the decision; leave the affected scope unimplemented or mark it blocked.

## 6. Repository and Git discipline

The AYQ repository is `alxvpl/AYQ`.

For every implementation increment:

- verify the intended repository, branch, HEAD, and working-tree state before editing;
- do not assume the GitHub default branch is the project trunk;
- do not reset, delete, overwrite, or force-rewrite newer work unless explicitly authorized and verified safe;
- do not mix unrelated changes into the increment;
- use the smallest sufficient change that satisfies the accepted specification;
- preserve existing work outside the authorized scope;
- keep commits reviewable and attributable to one bounded purpose;
- follow repository commit/PR rules, including required `[AI]` prefixes where applicable;
- do not claim a commit, push, CI result, artifact, or branch state without verifying it.

When multiple agents or sessions work on the repository, verify the branch/HEAD again before writing. Never assume another agent has not changed the repository.

## 7. AYQ / AYQ Analyses ownership boundary

AYQ Personal Finances owns canonical financial truth, including financial state and any AYQ-owned domain concepts explicitly defined as canonical.

AYQ Analyses receives structured read-only analytical input from AYQ and derives interpretations from that contract.

Unless an accepted specification explicitly changes the boundary, AYQ Analyses must not:

- read or write Actual Budget SQLite directly;
- read AYQ private sidecar/internal storage as an undocumented shortcut;
- modify canonical transactions, balances, accounts, categories, counterparties, recurring state, matching state, or canonical forecasts;
- recreate AYQ-owned canonical concepts from heuristics when the contract already supplies them;
- infer recurring truth merely from transaction regularity;
- silently promote derived analytical state into AYQ canonical state.

Cross-application integration must use an explicit documented interface.

## 8. Actual Budget boundary

AYQ is based on Actual Budget, but AYQ Analyses is a separate AYQ-owned application.

The upstream Actual code under `packages/` is protected baseline territory for AYQ work. AYQ Analyses features must not modify upstream `packages/` merely for convenience.

Any proposed change to protected Actual baseline code requires an explicit accepted reason, scope, and verification plan. Do not let analytical UI work leak into the engine fork without a documented architectural need.

Use AYQ-owned boundaries and contracts rather than coupling AYQ Analyses to undocumented Actual internals.

## 9. Architecture and security

AYQ Analyses is local-first and must preserve a strict process boundary.

Current accepted implementation principles include:

- Electron desktop application;
- React UI;
- renderer sandboxing;
- `contextIsolation: true`;
- `nodeIntegration: false`;
- `sandbox: true`;
- no direct renderer filesystem, Node, database, or engine access;
- narrow explicit preload/main-process capabilities;
- read-only snapshot import and local analytical archive unless superseded by an accepted integration contract.

Do not weaken these boundaries to simplify implementation.

New capabilities must expose the minimum necessary surface. Prefer explicit typed contracts over ambient access to filesystems, databases, globals, or engine internals.

## 10. Data and analytical semantics

Financial and analytical calculations must follow documented contracts and invariants, not UI convenience.

Key rules:

- provenance must remain traceable;
- evidence must be reproducible from allowed inputs;
- canonical AYQ concepts must remain canonical rather than being independently recomputed by Analyses;
- analytical classifications must distinguish known, insufficient, unresolved, not applicable, and undecidable states when the contract distinguishes them;
- missing information must not be converted into false certainty;
- exact financial values must not be approximated silently;
- reversals, transfers, exclusions, coverage boundaries, expected occurrences, and forecast snapshots must follow their documented semantics;
- a visually plausible result is not evidence of numerical correctness.

Do not invent thresholds, constants, rules, or classifications that are absent from the accepted specification. If a value is intentionally OPEN, keep it open or suppress the dependent behavior as specified.

## 11. User-facing behavior

User-facing behavior must be derived from the explicit user questions and product rules for the increment.

Do not expose every technically valid analytical result merely because it can be computed.

Visibility, suppression, prioritization, wording, grouping, and interaction behavior belong to the product-behavior layer defined in `00_COLLABORATION_MODEL.md`.

Implementation must not substitute internal state names, database terminology, or developer language for the Product Owner's conceptual language unless the specification explicitly requires it.

## 12. Design

AYQ Analyses should follow the accepted Windows desktop direction and its own documented design system/specification.

Current technical design baseline is Electron + React with Fluent UI; ECharts is used for analytical charting in the present implementation.

Do not reopen the technology stack merely to achieve a visual style.

Do not silently promote prototypes, mockups, exploratory styling, or temporary UI choices into accepted design rules.

Where a design decision is OPEN, implement only what can be done without deciding the open issue, or return the question to the design layer.

## 13. Data safety and privacy

Real banking or personally identifying financial data must never be committed to GitHub or placed in CI-visible material.

Do not put real financial data into:

- repository fixtures;
- committed snapshots;
- automated test data;
- CI logs;
- screenshots committed or attached to CI artifacts;
- build artifacts;
- public issue/PR text;
- diagnostic dumps intended for sharing.

Use synthetic or deliberately sanitized data for tests and verification.

Do not copy real banking data into external project documentation merely to make examples easier.

## 14. Implementation control

Use the smallest sufficient implementation for the accepted increment.

Do not:

- add speculative architecture for unaccepted future features;
- refactor unrelated code while implementing a narrow feature;
- introduce new dependencies without a concrete need;
- silently rename or relocate project concepts;
- convert temporary compatibility code into permanent architecture without documenting the decision;
- broaden permissions, filesystem access, IPC, or data access beyond the accepted requirement;
- implement adjacent OPEN features "for completeness".

When an accepted requirement conflicts with current code, surface the conflict explicitly rather than quietly changing the requirement to fit the code.

## 15. Testing and verification

Tests are evidence only when they exercise the real behavior they claim to protect.

For every implementation increment, use the verification required by its specification. As applicable, this includes:

- unit tests for pure analytical semantics;
- contract/schema validation;
- truth-manifest or benchmark checks;
- type checking;
- build verification;
- runtime smoke tests;
- Windows-specific packaging/runtime verification;
- regression tests for previously fixed behavior;
- product-level checks against the explicit user questions.

A test that is not invoked by the real test command or CI workflow does not guard the project.

Do not accept mocked proof when the requirement concerns a real integration boundary that can be tested directly.

Do not report "tests pass" without identifying what was actually run when the distinction matters.

Do not treat a green CI run as proof that undocumented behavior is correct.

## 16. Verification before claims

Before stating that something is complete, merged, clean, current, built, packaged, tested, or unchanged, verify the relevant evidence.

Examples:

- verify HEAD and diff before claiming scope purity;
- verify file/tree comparison before claiming protected areas are unchanged;
- verify actual test output before claiming tests pass;
- verify workflow/job status before claiming CI is green;
- verify artifact existence before claiming an installer exists;
- verify runtime behavior before claiming a UI path works.

If verification is unavailable, say that it is unverified.

## 17. Multi-agent work

Multiple AI systems may contribute to AYQ Analyses, but they do not create multiple sources of truth.

- repository documentation remains authoritative;
- each agent must inspect current state before acting;
- handoffs must identify verified state and remaining uncertainty;
- no agent may assume another agent's unverified statement is repository fact;
- implementation agents must not redefine product requirements;
- reviewers must review against the accepted specification, not against the executor's self-selected task list.

Role-specific responsibilities and bounded review outcomes are defined in `00_COLLABORATION_MODEL.md`.

## 18. Research and external information

Research may inform proposals, but external sources do not become project requirements automatically.

When using external documentation, upstream source code, standards, libraries, or product references:

- distinguish external fact from AYQ decision;
- verify current versions when version-sensitive;
- preserve licensing and attribution obligations;
- do not copy behavior merely because another product implements it;
- convert useful findings into explicit proposals or accepted repository documentation before implementation relies on them.

## 19. Documentation and decision control

Durable project decisions belong in repository documentation.

Keep documents internally consistent and avoid duplicating the same rule across multiple authoritative files unless one file clearly delegates to the other.

When a decision changes:

- update the authoritative document;
- mark obsolete material `SUPERSEDED` or remove ambiguity as appropriate;
- do not leave contradictory active instructions;
- preserve enough decision history to understand why a constraint exists when that history is materially useful.

Working notes must not be mistaken for accepted specification.

## 20. Destructive and irreversible actions

Do not perform deletion, overwrite, bulk move, history rewrite, migration, or other difficult-to-reverse operations without explicit scope and verification.

Before such an action:

1. identify exactly what will change;
2. verify the source/current state;
3. establish the required recovery or comparison evidence where applicable;
4. perform only the authorized operation;
5. verify the result afterward.

Never use destructive cleanup as a shortcut for understanding an inconsistent repository state.

## 21. Primary rule

Preserve truth, provenance, accepted boundaries, and the Product Owner's intent.

Do not optimize for appearing complete. Optimize for producing a result that is demonstrably correct, useful, traceable, and limited to the accepted scope.
