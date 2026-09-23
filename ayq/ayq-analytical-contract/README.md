# @ayq/analytical-contract

The executable AYQ → AYQ Analyses analytical snapshot contract, **1.0**: one
TypeScript type model (`src/types.ts`), one runtime validator
(`src/validate.ts`), synthetic fixtures (`fixtures/synthetic.ts`, test-only)
and the contract tests F01–F27 (`test/contract.test.ts`).

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
