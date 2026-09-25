# @ayq/analytical-contract

The executable AYQ → AYQ Analyses analytical snapshot contract, **1.1**: one
TypeScript type model (`src/types.ts`), one runtime validator
(`src/validate.ts`), synthetic fixtures (`fixtures/synthetic.ts`, test-only)
and the contract tests F01–F27 and V1–V12 (`test/contract.test.ts`).

It is the system of record for exact field names, structure, cardinality,
nullability and validation mechanics (A2 exchange 016 §4, as corrected by 017
PC1–PC3). It is subordinate to current AYQ Canon: `02_ARCHITECTURE` §7 owns
the egress architecture, `03_DATA` §13 owns the snapshot's content and
semantics, and `03_DATA` §3, §4, §7, §8, §9, §10 and §11 own the domain
meanings that cross. The package encodes those rules and does not extend them.

Private, unpublished, AYQ-owned. Node ≥ 22.18. No runtime dependency.

## Use

```ts
import { validateAnalyticalSnapshot, ContractValidationError } from '@ayq/analytical-contract';

const snapshot = validateAnalyticalSnapshot(JSON.parse(text)); // AnalyticalSnapshotV1, or throws
```

Consumers inside this repository import the source directly
(`../ayq-analytical-contract/src/index.ts`) and bundle it, as the desktop
and Analyses packages already do with the shared IPC contract.

## Version behaviour

`meta.contractVersion` is exact `major.minor`. This reader accepts major 1 and
any minor ≥ 0: a future 1.x may carry additive unknown fields, which the typed
result omits; the recursive forbidden-key scan still runs over every field,
known or unknown. Major ≠ 1, or a malformed version, is refused before content
is read. No capability is ever inferred from `producer.productVersion` or
`buildNumber`.

## Contract 1.1: four additive expectation facts

`AYQ_ANALYSES_A2_SPECIFICATION` r001 §5 adds, and §14 V1–V12 validates:

| field | presence | meaning |
|---|---|---|
| `meta.expectationsAsOfDate` | required for minor ≥ 1 | the AYQ "today" the plan and occurrence state were built with; not later than the UTC day of `generatedAt` |
| `expectationRecords[].expectedAccountKey` | optional | the included account AYQ's own record names; never inferred; the 1.0 spelling `accountKey` stays refused |
| `expectedOccurrences[].automaticMatchThroughDate` | required on every occurrence for minor ≥ 1 | the last day of AYQ's automatic matching date window; not before `expectedDate` |
| `expectedOccurrences[].automaticMatchWindowCovered` | exactly when the record has `expectedAccountKey` | whether AYQ's proven coverage of that account spans the whole window |

The facts are read, and required, only where the snapshot declares minor ≥ 1.
A 1.0 snapshot is checked exactly as the 1.0 reader checked it and its typed
result carries none of them, so a consumer can tell a 1.0 snapshot from one
that has the facts. From minor 1, "overdue" is judged as of
`expectationsAsOfDate` rather than the production day. The contract carries
the end of the matching window, never its width: the width is AYQ's.

## Two mappings the consumer inherits rather than infers (017 PC2, §3)

**Category states and A1's Uncategorised filter.** A transaction's category is
one of `categorised`, `uncategorised` or `not_applicable`. A1's Category
filter entry *Uncategorised* selects `state: "uncategorised"` and nothing
else. `not_applicable` is **not** a filter value: it is reserved for internal
transfers (the validator refuses it anywhere else and refuses any other state
on an internal transfer), and internal transfers are removed from A1's
population upstream of the filter, by the internal-transfer exclusion of the
A1 specification's filtering order (r004 §8.4 step 4). They never reach the
filter, the counterparty rows, the exclusion counts or the chart.

**`meta.counts` are integrity metadata, never a filtered result's counts.**
The validator checks them against the whole snapshot's content. A consumer
that shows a count for a scoped result — the exclusion line, an uncategorised
total — computes it from the transactions it selected.

## Product impact recorded against one row (017 PC1)

`category.source` carries three values, `manual`, `learned_rule` and
`automatic`, because `03_DATA` §11.11 distinguishes automation from a learned
rule. A consumer that renders provenance therefore needs a fourth sentence
for `automatic`; that sentence is product wording owned by the Analyses
Design System, not by this package, and nothing in this package renders it.

## What the validator proves about minimisation, and what it cannot

It refuses every forbidden raw-identifier field name at any depth
(`FORBIDDEN_KEYS`), refuses an unmasked account identifier, and refuses an
`evidenceText` longer than 256 code points, containing a line break, or
carrying an obvious full IBAN. It cannot prove that an arbitrary string is
free of every excluded identifier: full compliance with `03_DATA` §13.8
remains the producer's provenance obligation.

## Scripts

`npm test` · `npm run typecheck` · `npm run build` (emits `dist/` with
declarations). All fixtures are invented; no real financial datum exists in
this package.
