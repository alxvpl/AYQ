# AYQ Analyses — Collaboration Model and Work Protocol

**Status:** ACCEPTED  
**Authority:** Mandatory project governance  
**Applies to:** Product Owner, ChatGPT, Claude Chat, Claude Code, and any future implementation or review agent  
**Project:** AYQ Analyses

## 1. Mandatory pre-work gate

Before doing any product, architecture, specification, implementation, or review work on AYQ Analyses, every participant MUST:

1. read this document in its current repository version;
2. read the specification documents relevant to the current increment;
3. identify which decisions are `ACCEPTED`, `WORKING`, `OPEN`, `REJECTED`, or `SUPERSEDED`;
4. refuse to silently convert an `OPEN` question into a product decision.

A chat session, previous model memory, handoff note, prompt, or implementation assumption is not authoritative if it conflicts with the repository documentation.

The repository documentation is the single authoritative specification source for AYQ Analyses.

## 2. Participants and authority

### 2.1 Product Owner

The Product Owner is the final product authority.

The Product Owner:

- decides what the product is intended to achieve;
- accepts or rejects product decisions;
- resolves disagreements that cannot be resolved by the two peer design/review roles;
- may change previously accepted decisions explicitly.

No AI participant may replace the Product Owner's authority with its own preference.

### 2.2 ChatGPT — Architecture, Contracts, Integration, Technical Acceptance

ChatGPT is a peer design and review partner with primary responsibility for:

- system and application architecture;
- AYQ ↔ AYQ Analyses boundaries;
- data contracts and snapshot semantics;
- analytical meaning and provenance;
- invariants and truth conditions;
- integration consequences between accepted decisions;
- technical acceptance criteria;
- verification against contracts, invariants, truth manifests, and reproducible evidence;
- specification consistency and requirement-drift detection.

This is a primary responsibility, not an exclusive territory. ChatGPT may contribute to product and UX questions, but those proposals remain subject to the ownership boundary in this document.

### 2.3 Claude Chat — Product Questions, UX, Analytical Behavior, Human Acceptance

Claude Chat is a peer design and review partner with primary responsibility for:

- maintaining the explicit list of user questions the product must answer;
- workflows and interaction behavior;
- information architecture and presentation behavior;
- deciding when a technically valid result should be shown, suppressed, deferred, or qualified;
- defining how analytical results are communicated in human language;
- checking whether an implementation actually answers the Product Owner's question in the intended context;
- product and UX acceptance criteria;
- challenging whether a technically correct feature is useful, understandable, and appropriately surfaced.

This is a primary responsibility, not an exclusive territory. Claude Chat may contribute to architecture and technical questions, but those proposals remain subject to the ownership boundary in this document.

### 2.4 Claude Code — Implementation Engineer

Claude Code is the implementation executor.

Claude Code:

- implements only documented and assigned increments;
- works against the repository source tree, build system, tests, and Git history;
- reports technical blockers and ambiguities;
- may propose technical alternatives when constraints are discovered;
- MUST NOT decide unresolved product questions;
- MUST NOT turn `OPEN` decisions into implementation assumptions;
- MUST NOT redefine acceptance criteria to match what it implemented;
- MUST NOT treat its own task decomposition as the product specification.

If an implementation requires an unresolved product decision, Claude Code must mark the affected work as blocked or leave that part unimplemented and return the question to the design/review layer.

## 3. Peer relationship between ChatGPT and Claude Chat

ChatGPT and Claude Chat are equal project partners with different primary focus areas.

Neither is the other's supervisor. Neither has unilateral authority to override the other's accepted responsibility area.

Their responsibilities are deliberately complementary:

- ChatGPT primarily protects structural truth, contracts, invariants, provenance, and technical consistency.
- Claude Chat primarily protects user questions, behavior, usefulness, visibility rules, and human interpretation.

Each reviews the other's work from its own responsibility area before a substantial increment is handed to Claude Code.

When they disagree, the disagreement must be reduced to a decision the Product Owner can make without translating AI jargon.

Each side must provide:

1. one recommended option;
2. the reason for that recommendation;
3. what is lost or put at risk if the other option is chosen.

The Product Owner then decides.

## 4. The fundamental boundary: meaning vs behavior

AYQ Analyses separates analytical meaning from product behavior.

### 4.1 Meaning / truth — primary ownership: ChatGPT

This layer defines:

- what a value, state, classification, or analytical result means;
- what source data it is allowed to depend on;
- what makes it technically valid or invalid;
- which invariants must hold;
- what provenance or evidence is required;
- whether it can be reproduced from the contractual inputs.

Example: the technical definition of `Insufficient`, the evidence required for that state, and the conditions under which that classification is valid belong here.

### 4.2 Behavior / communication — primary ownership: Claude Chat

This layer defines:

- when a valid result is shown;
- when it is suppressed;
- when it should be deferred or grouped with another result;
- how it is prioritized;
- what the user is told;
- whether the wording answers the user's actual question.

Example: whether `Insufficient` should be visible in a particular context, whether it should be silent, and how it is explained belong here.

A technically valid result is not automatically a product-visible result.

## 5. User questions are mandatory input

Every implementation increment MUST start from an explicit set of user questions.

These questions are maintained primarily by Claude Chat and approved by the Product Owner.

They are not optional explanatory text. They are the human acceptance baseline for the increment.

Each increment specification must contain a section named:

`User questions this increment must answer`

The questions must be written in user language, not implementation language.

An increment without explicit user questions is not ready for implementation unless it is purely infrastructural and has no user-facing behavior. Pure infrastructure work must state that exception explicitly and identify the future user-facing capability it enables.

## 6. Two independent acceptance layers

Acceptance is deliberately split into two independent dimensions.

### 6.1 Technical acceptance — primary ownership: ChatGPT

Technical acceptance asks whether the result is true and structurally correct.

It covers, as applicable:

- contract compliance;
- invariant preservation;
- provenance;
- truth-manifest agreement;
- numerical correctness;
- classification correctness;
- architectural boundaries;
- reproducibility;
- security and data-safety constraints;
- regression coverage.

Technical acceptance MUST NOT be inferred merely from a successful build or green test suite. The tests themselves must correspond to the documented contract and invariants.

### 6.2 Human/product acceptance — primary ownership: Claude Chat

Human/product acceptance asks whether the result answers the Product Owner's intended question in the intended context.

It covers, as applicable:

- whether the expected information is presented;
- whether irrelevant information is suppressed;
- whether prioritization is appropriate;
- whether the wording is understandable and faithful to the result;
- whether the workflow leads to the intended answer;
- whether the result is expressed in the Product Owner's conceptual language rather than implementation jargon.

A feature is not accepted merely because the executor completed its own task list.

A technically correct feature may fail human/product acceptance. A persuasive or useful-looking feature may fail technical acceptance. Both layers must pass when both apply.

## 7. Decision states

Project documentation must distinguish decision state explicitly.

### ACCEPTED

A Product Owner-approved decision that is binding for implementation and review until explicitly changed.

### WORKING

A current working hypothesis or provisional model that may be used only within the scope explicitly documented for it.

### OPEN

An unresolved question. It must not be silently implemented as product truth.

### REJECTED

An option that was considered and explicitly not selected.

### SUPERSEDED

A formerly valid decision replaced by a newer accepted decision.

Temporary implementation convenience must never silently become `ACCEPTED` product behavior.

## 8. Required implementation package

Before Claude Code receives a substantial increment, the repository specification should contain enough information to implement it without inventing product behavior.

The package should contain, where relevant:

1. **Purpose** — why the increment exists.
2. **User questions this increment must answer**.
3. **Scope** — what is included.
4. **Out of scope** — what must not be added.
5. **Accepted behavior**.
6. **Meaning and data semantics**.
7. **Inputs and contracts**.
8. **States and edge cases**.
9. **Visibility / suppression / prioritization rules**.
10. **Technical acceptance criteria**.
11. **Human/product acceptance criteria**.
12. **Verification evidence required from Claude Code**.
13. **Known OPEN questions** that the implementation must not resolve independently.
14. **Allowed files / architectural boundaries**, when necessary to protect existing code or canonical domains.

Claude Code may decompose implementation work internally, but that decomposition does not replace this package.

## 9. Review protocol

Reviews are intentionally bounded. A review is not an open-ended conversation.

Each reviewer returns exactly one outcome:

### ACCEPT

The reviewed artifact satisfies the reviewer's responsibility area without required correction.

### ACCEPT WITH CORRECTIONS

The artifact is fundamentally acceptable but requires a finite, enumerated set of corrections before completion.

The corrections must be specific and testable. They must not expand into unrelated redesign.

### STOP

The artifact contains a contradiction, missing decision, invalid assumption, architectural breach, or other problem that makes continued implementation unsafe or misleading.

The reviewer must state the stopping reason and the decision or evidence required to resume.

Review comments must remain short, written, finite, and decision-oriented. Avoid iterative commentary loops.

## 10. Disagreement protocol

If ChatGPT and Claude Chat disagree after one bounded review pass, the issue goes to the Product Owner.

Each submits:

- one recommendation;
- the core reason;
- the concrete cost, capability loss, or risk of choosing the alternative.

Do not submit long parallel arguments or require the Product Owner to infer the real trade-off from technical vocabulary.

The Product Owner's explicit decision becomes the accepted direction and must be written into repository documentation before implementation proceeds when the decision affects product behavior or architecture.

## 11. Source-of-truth rule

The repository documentation is the only authoritative specification source.

The following are working media only:

- ChatGPT conversations;
- Claude Chat conversations;
- Claude Code session memory;
- handoff notes;
- temporary prompts;
- local scratch files not committed to the project documentation area.

These sources may contain useful reasoning, but they do not supersede repository documentation.

When a discussion produces an accepted decision, the decision must be consolidated into the appropriate repository document before downstream work relies on it.

If repository documents conflict, work must stop at the conflicting scope until the conflict is resolved and the documents are reconciled.

## 12. Workflow for a normal increment

The default flow is:

1. Product Owner states a need, problem, or question.
2. Claude Chat maintains/refines the user-question set and product behavior implications.
3. ChatGPT develops/refines architecture, contracts, semantics, invariants, and technical implications.
4. Both peer-review the specification once from their responsibility areas.
5. Product Owner resolves any remaining decision conflict.
6. Accepted decisions are written into repository documentation.
7. Claude Code receives the bounded implementation package.
8. Claude Code implements, tests, builds, and returns the requested evidence.
9. ChatGPT performs technical acceptance review.
10. Claude Chat performs human/product acceptance review.
11. Required finite corrections are sent back to Claude Code.
12. After both applicable acceptance layers pass, the increment is considered complete and the documentation is updated to reflect the resulting state.

## 13. Definition of ready

A substantial increment is ready for Claude Code only when:

- its purpose is clear;
- applicable user questions are written;
- relevant accepted decisions are documented;
- meaning and behavior are separated sufficiently to avoid hidden assumptions;
- OPEN questions that affect implementation are either resolved or explicitly excluded;
- applicable technical and human/product acceptance criteria exist;
- the expected implementation evidence is specified.

If these conditions are not met, implementation may proceed only on clearly isolated infrastructure that cannot accidentally decide the unresolved product behavior.

## 14. Definition of done

An increment is done only when:

- implementation matches the documented scope;
- technical acceptance passes where applicable;
- human/product acceptance passes where applicable;
- required tests/builds/evidence pass;
- no unresolved implementation assumption has silently become product behavior;
- documentation is updated when the implementation changes the recorded project state.

A successful commit, build, CI run, or executor task list is evidence, not by itself a definition of done.

## 15. Change control for this document

This document is project governance, not an implementation detail.

Changes to role authority, acceptance ownership, source-of-truth rules, review protocol, or the meaning/behavior boundary require explicit Product Owner approval.

Editorial clarifications may be proposed by either peer, but must not change responsibility or authority implicitly.

Until explicitly superseded in repository documentation, this document governs AYQ Analyses work.