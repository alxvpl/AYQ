# AYQ — Project Work Instructions

**Status:** ACCEPTED  
**Authority:** Mandatory operating instructions for the AYQ project and its governed subprojects  
**Applies to:** Product discussion, research, specification, architecture, implementation planning, implementation, review, verification, documentation, and integration work

These instructions govern the AYQ project as a whole. Subprojects may add stricter or more specific instructions, but they must not silently override AYQ Canon or these project-wide rules.

## 1. Project identity

AYQ Personal Finances is an independent standalone personal-finance project with its own product, repository, versioning, architecture, and data ownership.

AYQ is separate from CIVION. Future AYQ ↔ CIVION integration must happen through an explicit interface; neither project owns the other's canonical domain state.

AYQ uses Actual Budget as an engine foundation while maintaining AYQ-owned product behavior, UI, integration logic, and domain extensions where explicitly accepted.

AYQ Analyses is a governed AYQ subproject and separate Windows application. Its governing boundary is:

> **AYQ owns the financial truth. AYQ Analyses interprets it.**

## 2. Communication

- Communicate with the Product Owner in Bulgarian unless another language is requested.
- Instructions may be brief, approximate, transliterated, or rely on established context; infer intent from the current request, governing documents, and verified project state.
- Ask for clarification only when materially different interpretations would make the result unusable, unsafe, or irreversible. Otherwise make the safest bounded interpretation explicit and proceed.
- Be direct and precise. Distinguish verified facts, accepted decisions, working assumptions, proposals, and open questions.
- Do not make the Product Owner translate implementation jargon into product meaning.

## 3. Mandatory pre-work gate

Before substantial AYQ work, every participant MUST:

1. read this file in its current repository version;
2. read [`01_CANON_INDEX.md`](01_CANON_INDEX.md);
3. read the current AYQ Canon objects relevant to the requested scope;
4. read any applicable subproject instructions;
5. inspect current repository/branch/implementation state when the task concerns code, CI, packaging, migration, or verification;
6. identify conflicts or OPEN questions before acting on them.

Chat history, handoff notes, model memory, prompts, Notion summaries, and working documents are supporting context only. They do not override the Product Owner or current AYQ Canon.

## 4. Authority order

Authority follows the current AYQ `00_INDEX.md`.

In summary:

1. newest explicit accepted decision of the Product Owner;
2. current AYQ Canon object that owns the question;
3. verified implementation state in GitHub and CI;
4. working material;
5. legacy/reference material.

If a newer accepted Product Owner decision conflicts with Canon, do not keep both in force. The relevant Canon object must be revised.

If two Canon objects appear to conflict, the object that owns the question according to `00_INDEX.md` prevails. If ownership itself is unclear, stop at that scope and return the issue for resolution.

## 5. Canon discipline

AYQ Canon is governed by `00_INDEX.md` and its registered objects.

Do not:

- create parallel authoritative documents for a topic already owned by a Canon object;
- treat working material, prototypes, audits, session notes, comparisons, or implementation reports as Canon;
- silently promote a temporary implementation choice into a product decision;
- overwrite an OPEN question with an implementation assumption;
- change Canon meaning indirectly through code without recording the accepted decision in the owning Canon object.

Use stable Canon names and ownership rules defined by `00_INDEX.md`.

## 6. Execution gate

Discussion, analysis, brainstorming, research, criticism, or design exploration does not by itself authorize implementation or durable project changes.

Implementation, repository writes, Canon revisions, structural migrations, destructive operations, releases, or integration changes require explicit Product Owner authorization for the applicable scope.

"Continue", "proceed", or equivalent wording counts as authorization only when the current work package already makes the scope unambiguous.

Do not broaden an authorized increment merely because adjacent work appears useful.

## 7. Repository and Git discipline

Repository: `alxvpl/AYQ`.

For implementation work:

- verify repository, intended branch, HEAD, and working-tree state before editing;
- do not assume the GitHub default branch is the current AYQ development trunk;
- preserve unrelated work;
- keep changes bounded to the accepted increment;
- do not force-rewrite, reset, delete, or overwrite newer work without explicit authorization and verified safety;
- follow repository commit/PR rules, including required `[AI]` prefixes where applicable;
- verify pushes, commits, CI runs, artifacts, and branch state before claiming them;
- when another agent or session may have changed the branch, re-read HEAD before writing.

A green build or commit is evidence of implementation state, not product acceptance by itself.

## 8. Actual Budget boundary

Actual Budget is the engine foundation, not the product authority for AYQ.

Use existing Actual architecture and engine capabilities where they fit AYQ, but do not let upstream structure silently define AYQ product behavior.

Changes to upstream-derived engine territory must be deliberate, scoped, testable, and justified by an accepted AYQ requirement. Prefer AYQ-owned extension/integration boundaries when they can satisfy the requirement without unnecessary divergence from upstream.

Do not introduce dependency on undocumented Actual internals when a stable AYQ-owned contract can express the boundary.

Upstream intake and release discipline are governed by AYQ `06_RELEASE.md`.

## 9. Financial truth and data ownership

Canonical financial meaning is governed by AYQ `03_DATA.md` and related owning Canon objects.

Implementation must preserve:

- canonical ownership of financial objects;
- import and deduplication semantics;
- counterparty identity rules;
- manual-decision precedence where Canon defines it;
- store/data integrity requirements;
- Plan + Forecast semantics;
- statement coverage and reconciliation rules;
- reversal/refund semantics;
- provenance and evidence requirements.

Do not recompute or reinterpret a Canon-owned concept differently in another layer merely because doing so is convenient for UI or analytics.

Unknown, insufficient, unresolved, not applicable, and undecidable states must not be collapsed into false certainty when the governing contract distinguishes them.

## 10. Local-first and privacy

AYQ is local-first unless an accepted integration explicitly introduces another boundary.

Real banking or personally identifying financial data MUST NOT be committed to GitHub or exposed through CI-visible material.

Do not place real banking data in:

- repository fixtures;
- committed snapshots;
- unit/E2E test data;
- CI logs;
- screenshots committed to the repository or attached to CI artifacts;
- public issues or pull requests;
- diagnostic dumps intended for sharing.

Use synthetic or deliberately sanitized data for reproducible tests and examples.

## 11. Product and design discipline

Product scope is governed by `01_PRODUCT.md`. Architecture by `02_ARCHITECTURE.md`. Data semantics by `03_DATA.md`. Accepted desktop design by `04_DESIGN.md`. CIVION integration by `05_INTEGRATION.md`. Release/engineering discipline by `06_RELEASE.md`.

Do not reopen accepted decisions merely because a different implementation or visual approach is possible.

Do not promote mockups, experiments, temporary styling, or reference-product behavior into accepted AYQ design without an explicit decision.

When a design or product question is OPEN, implement only the portions that do not decide it silently.

## 12. Implementation control

Use the smallest sufficient change that satisfies the accepted requirement.

Do not:

- refactor unrelated code during a narrow increment;
- add speculative architecture for unaccepted future features;
- introduce dependencies without a concrete need;
- broaden filesystem, IPC, database, network, or permission surfaces beyond the accepted requirement;
- rename or relocate established concepts without a documented reason;
- implement adjacent OPEN features "for completeness";
- redefine the requirement to match what is easiest to build.

If accepted requirements and current implementation conflict, surface the conflict explicitly.

## 13. Testing and verification

Tests must correspond to the behavior they claim to protect.

Use the verification appropriate to the scope, including where applicable:

- unit tests for domain and analytical semantics;
- contract/schema validation;
- regression tests;
- truth/benchmark checks;
- type checking;
- build verification;
- runtime smoke tests;
- Windows packaging/runtime verification;
- E2E or integration tests across real boundaries;
- CI verification.

A test that exists but is not invoked by the real test command or CI does not guard the project.

Do not report "tests pass" without verifying what actually ran when the distinction matters.

Do not accept mocked evidence for a real integration boundary when direct verification is practical and required by the specification.

## 14. Verification before claims

Verify evidence before claiming that something is:

- current;
- clean;
- unchanged;
- implemented;
- committed;
- pushed;
- merged;
- built;
- packaged;
- tested;
- green in CI;
- working at runtime.

If evidence is unavailable, state that the claim is unverified.

## 15. Multi-agent work

AYQ may be worked on by multiple AI systems and sessions, but this does not create multiple authorities.

Every agent must load the same governing documents and inspect current state before acting.

Handoffs are context aids, not authority. They should identify:

- verified current state;
- branch/commit when relevant;
- accepted decisions relied upon;
- remaining OPEN questions;
- unfinished work and known risks.

Do not trust another agent's implementation claim without repository or runtime evidence when verification matters.

## 16. Governed subprojects

A subproject may define additional mandatory instructions inside its own tree.

Subproject rules:

- supplement AYQ-wide instructions;
- may be stricter or more specific;
- must not silently contradict AYQ Canon;
- must state their own source-of-truth and review rules where those differ operationally;
- must preserve explicit interfaces with AYQ-owned domains.

### AYQ Analyses

For any task involving AYQ Analyses, after reading this file and `01_CANON_INDEX.md`, also read:

1. `../ayq-analyses/docs/00_COLLABORATION_MODEL.md`
2. `../ayq-analyses/docs/01_PROJECT_WORK_INSTRUCTIONS.md`

AYQ Analyses repository documentation is authoritative for Analyses-specific specification and workflow, subject to AYQ Canon on AYQ-owned financial truth and cross-project boundaries.

## 17. Research and external references

External documentation, upstream code, standards, libraries, competitor products, and design references may inform proposals but do not become AYQ requirements automatically.

When using external material:

- distinguish external fact from AYQ decision;
- verify version-sensitive claims;
- preserve licensing/attribution obligations;
- avoid cargo-cult copying;
- convert accepted findings into the appropriate project documentation before implementation depends on them.

## 18. Documentation control

Keep authoritative documents internally consistent.

Avoid duplicating the same rule in multiple authoritative files unless one clearly delegates to the other.

When an accepted decision changes:

- revise the owning Canon/specification document;
- mark or archive superseded material according to its governing rules;
- remove active contradictions;
- preserve materially useful decision history.

## 19. Destructive or irreversible operations

Do not perform deletion, overwrite, bulk move, history rewrite, migration, or other difficult-to-reverse operations without explicit scope and verification.

Before such an action:

1. identify exactly what changes;
2. verify source/current state;
3. establish recovery/comparison evidence where applicable;
4. perform only the authorized action;
5. verify the result.

Never use destructive cleanup as a substitute for understanding inconsistent state.

## 20. Primary operating rule

Preserve the Product Owner's intent, AYQ Canon, financial truth, provenance, project boundaries, and reproducibility.

Do not optimize for appearing complete. Optimize for a result that is demonstrably correct, useful, traceable, and limited to the accepted scope.
