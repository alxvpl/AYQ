# ayq-camt

Step 3 of the spike: CAMT.053 to a **lossless intermediate bank record**, plus
counterparty resolution through a chain of evidence.

The monorepo is not forked. The starting point —
`loot-core/src/server/transactions/import/xmlcamt2json.ts` from Actual 26.9.0
(HEAD `db1b0ea`), 168 lines — was **copied** and extended.

---

## What it solves

The measurement over 212 daily files (`AYQ_camt_measurement-r001.md`) showed
two things that shape the whole design:

1. The original parser handles 212 of 212 without an error, but yields five
   fields and discards the counterparty IBAN, `BkTxCd`, the whole `Refs` block,
   the BIC, one of the two dates, `Sts`, `RvslInd`, `Purp` and `RtrInf`.
2. **201 card and ATM entries produce 201 distinct names**, because the string
   carries the terminal, the date, the time and the card number. Conversely,
   38 % of entries have no counterparty IBAN at all.

Hence the two rules here: the record keeps everything the bank gives, and
counterparty resolution starts at `BkTxCd` — present on all 567 entries —
rather than at the IBAN.

## Install and run

Node >= 22.18 (Node strips the types itself; there is no build step).

```bash
npm install
npm test          # 51 tests
npm run typecheck
```

## Verifying against the real export

One command does everything: parse every file, `measure`, `audit`, and evaluate
the criteria, ending in a plain `PASS` or `FAIL` and an exit code of 0 or 1.

The input may be a directory (walked recursively), a single XML file, **or the
ZIP archive exactly as downloaded** — it is read in memory and nothing is
extracted.

```powershell
# Windows / PowerShell
node src\ayq-cli.ts verify "$HOME\Downloads\00000000_010126000000.zip" `
  --out "$HOME\ayq-camt-report.txt" --json "$HOME\ayq-camt-report.json"
```

```bash
# Linux / macOS
node src/ayq-cli.ts verify ~/Downloads/00000000_010126000000.zip \
  --out ~/ayq-camt-report.txt --json ~/ayq-camt-report.json
```

The criteria — the defaults are what r001 measured, and they can be changed
with `--expect-files=N`, `--expect-entries=N`, `--expect-txdtls=N`:

| Criterion | Expected | Fails the spike |
|---|---|---|
| files read without error | 212 | yes |
| files that failed to parse | 0 | yes |
| `<Ntry>` entries | 567 | yes |
| entries with `<TxDtls>` | 350 | yes |
| entries without `<TxDtls>` | 217 | yes |
| `BkTxCd` on every intermediate record | all | yes |
| `BookgDt` **and** `ValDt` on every record | all | yes |
| uncovered XML paths | 0 | **no** — calls for a decision |
| `<Ntry>` with more than one `<TxDtls>` | 0 | **no** — calls for a decision |

The last two are non-blocking on purpose. An uncovered path is not a defect but
a list of decisions — which field enters `AyqBankEntry` and which stays out. A
batched entry is not a defect either, but exactly the case r003 §11.4 worried
about: r001 measured zero of them, so if one appears it must be seen rather
than merged away.

The 350/217 counts are about `<Ntry>`, not intermediate records — in a batch
one `<Ntry>` yields several records and the two numbers diverge. The report
shows both.

### The report is safe to share

`verify`, `measure` and `audit` print no IBAN, name, amount, description,
reference or file name — only counts and XML element names. A file that fails
to parse is reported by ordinal, because export file names carry an account
number. Both the text and the JSON report can be sent as they are.

`parse` and `trail` print content and stay on their own machine:

```bash
node src/ayq-cli.ts measure ~/bankafschriften   # counts only
node src/ayq-cli.ts audit   ~/bankafschriften   # what the record does not read
node src/ayq-cli.ts trail   ~/bankafschriften/20260531.xml   # chain, record by record
node src/ayq-cli.ts parse   ~/bankafschriften/20260531.xml   # JSON on stdout
```

`measure` reproduces the tables from the measurement and adds the number this
step exists for: how many distinct keys survive normalisation, against how many
distinct names Actual's five fields produce.

The ZIP reader is our own, about 110 lines over `node:zlib`, with no new
dependency. It supports store and deflate; zip64, encryption and unknown
methods are reported as errors rather than half-read.

## The intermediate record

`AyqBankEntry` (`src/ayq-types.ts`). One record per `<TxDtls>`; when `<TxDtls>`
is absent, one per `<Ntry>` with the full entry context. For 217 of the 567
measured entries the second form is the only one.

| Group | Fields |
|---|---|
| Context | account (IBAN / `Othr`), currency, owner, bank BIC, `Id`, `LglSeqNb`, `FrToDt`, schema, file |
| Position | statement index, `<Ntry>` index, `<TxDtls>` index, `<TxDtls>` count |
| Amounts | transaction amount and `<Ntry>` amount separately, currency, **the raw string** |
| Dates | `BookgDt` **and** `ValDt` apart, as a day and as a full instant |
| Classification | `BkTxCd` — `Domn`/`Fmly`/`SubFmlyCd`, `Prtry`; at both `<Ntry>` and `<TxDtls>` level |
| References | `EndToEndId`, `MndtId`, `AcctSvcrRef`, `InstrId`, `MsgId`, `PmtInfId`, `TxId`, `ChqNb`, `ClrSysRef`, `Prtry` |
| Parties | debtor, creditor, ultimate parties: name, IBAN, `Othr`, currency, country, address, identifiers |
| Banks | `RltdAgts` — debtor, creditor and intermediary agent BICs |
| State | `Sts`, `RvslInd`, `RtrInf` (reason, originator, original `BkTxCd`) |
| Description | `RmtInf/Ustrd` line by line, `RmtInf/Strd`, `AddtlNtryInf`, `AddtlTxInf`, `NtryRef`, and the raw description untouched |
| Other | `Purp`, `AmtDtls` + `CcyXchg`, `Chrgs`, `Btch`, a deduplication key |

The padding out to exactly 32,500 bytes is cut before parsing
(`ayqStripPadding`), because otherwise two exports of the same day never
compare equal.

### The losslessness audit

"Nothing is lost" is a claim, so it is made checkable. `ayqAuditCoverage` walks
the raw XML, collects every leaf path and compares them against the declared
list of what is read. An empty result means the record really does carry
everything. An unknown field comes out with a hit count instead of being
silently passed by.

## The counterparty

Not a string but a resolved object (`AyqCounterparty`) that records the layer
which made the call:

1. **`bank-transaction-code`** — always classifies; pronounces a name only when
   the counterparty is the bank itself (a fee, interest).
2. **`structured`** — `RltdPties` plus the counterparty IBAN.
3. **`intermediary`** — for Mollie, Adyen, Buckaroo, Stripe, PAY.nl, CCV and
   the rest, the IBAN belongs to the intermediary, not the merchant. This layer
   never decides; it only stops the previous one from being accepted.
4. **`description`** — parsing the free text: `BEA`/`GEA` (terminal, date, time
   and card number are separated out), SEPA with slash tags (`/TRTP/…/NAME/…`)
   and with Dutch labels (`Naam:`, `Incassant:`, `Machtiging:`).
5. **`alias`** — the manual table, by IBAN, by mandate or by normalised key. It
   has the last word.

Every layer leaves a trace even when it passes (`trail`), so every name can be
explained and challenged. `ayq-camt trail` prints the chain.

The built-in intermediary list matches on **names and descriptor prefixes**.
There are deliberately no IBANs: an unverified built-in IBAN would produce
silent wrong answers. Known ones are supplied through
`AyqResolveOptions.intermediaryIbans`.

## Compatibility

`ayqToLegacyTransaction` produces Actual's five fields from the intermediate
record — the extension is additive, not a replacement. It also serves as the
baseline the measurement compares against.

The only behavioural difference: the party name is read from the party's own
`<Nm>`. The original searches for `<Nm>` recursively and, for a party without a
name, picks up the name from the postal address.

## Size of the change

| | lines |
|---|---|
| Original (`xmlcamt2json.ts`) | 168 |
| Parser (`ayq-camt053.ts`) | 456 |
| Record types | 239 |
| XML access | 135 |
| Counterparty resolution | 762 |
| Audit, measurement and criteria | 542 |
| File and ZIP reading | 253 |
| CLI | 330 |
| Tests and fixtures | 1163 |

## Scope

Step 3 ends here. Step 4 (loading through `@actual-app/api`) and step 5 (a
custom screen) have not been started; this package does not depend on Actual in
any way and needs no build of the monorepo.

Real bank data never enter the repository. Every fixture is invented.
