// Writes the two invented files the 03 §7.10–§7.16 acceptance step reads.
//
// Both are dated relative to the day the run happens, and that is the point.
// 03 §7.14 dates a record's expectations from the day it was decided, so a
// committed fixture with fixed dates can no longer stand in for months of use:
// a record typed today expects nothing yesterday, whatever its start date says.
// What the step needs is the state a person would actually be in — records
// decided months ago, and a statement that arrived this week — so the state is
// generated, on the day, from arithmetic.
//
// Everything in both files is made up. The IBAN is a test number, the creditors
// do not exist, the mandate is invented and the amounts are round. No real
// statement enters this repository and none reaches CI.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const [, , storeTarget, camtTarget, stated] = process.argv;
if (!storeTarget || !camtTarget) {
  process.stderr.write(
    'usage: node make-conformance-fixture.mjs <store.json> <statement.xml> [YYYY-MM-DD]\n',
  );
  process.exit(2);
}

/** The day the run happens, or a stated one so the generator itself is testable. */
const today = stated ?? new Date().toISOString().slice(0, 10);

function day(offset) {
  const at = new Date(`${today}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + offset);
  return at.toISOString().slice(0, 10);
}

const MANDATE = 'AYQ-TEST-MANDATE-0001';
const IBAN = 'NL01TEST0123456789';

/* ------------------------------------------------------------ the statement */

let reference = 0;
function entry({ date, cents, credit = false, creditor, mandate, extra = '' }) {
  reference += 1;
  return `      <Ntry>
        <Amt Ccy="EUR">${(cents / 100).toFixed(2)}</Amt>
        <CdtDbtInd>${credit ? 'CRDT' : 'DBIT'}</CdtDbtInd><Sts>BOOK</Sts>
        <BookgDt><Dt>${date}</Dt></BookgDt><ValDt><Dt>${date}</Dt></ValDt>
        <AcctSvcrRef>CONF${String(reference).padStart(10, '0')}</AcctSvcrRef>
        <BkTxCd><Domn><Cd>PMNT</Cd><Fmly><Cd>${
          credit ? 'RCDT' : 'DDBT'
        }</Cd><SubFmlyCd>${credit ? 'SALA' : 'PMDD'}</SubFmlyCd></Fmly></Domn></BkTxCd>
        <NtryDtls><TxDtls>
          <Refs><EndToEndId>CONF-E2E-${reference}</EndToEndId>${
            mandate ? `<MndtId>${mandate}</MndtId>` : ''
          }</Refs>
          <RltdPties><${credit ? 'Dbtr' : 'Cdtr'}><Nm>${creditor}</Nm></${
            credit ? 'Dbtr' : 'Cdtr'
          }></RltdPties>
          <RmtInf><Ustrd>${creditor}${extra}</Ustrd></RmtInf>
        </TxDtls></NtryDtls>
      </Ntry>`;
}

const entries = [
  // Something to live on, so the position is not a wall of red.
  entry({
    date: day(-5),
    cents: 125_000,
    credit: true,
    creditor: 'TESTWERKGEVER B.V.',
    extra: ' SALARIS',
  }),
  // The two that make 03 §7.16 bite: the same subscription, the same mandate,
  // the same amount, twice in one week. Either could be the payment the record
  // expected, and choosing between them is a judgement, not a deduction.
  entry({
    date: day(-3),
    cents: 2_495,
    creditor: 'TESTABONNEMENT B.V.',
    mandate: MANDATE,
    extra: ' ABONNEMENT',
  }),
  entry({
    date: day(-1),
    cents: 2_495,
    creditor: 'TESTABONNEMENT B.V.',
    mandate: MANDATE,
    extra: ' ABONNEMENT',
  }),
  // And one with nothing identifying it, for the match a person has to make.
  entry({
    date: day(0),
    cents: 6_190,
    creditor: 'TESTENERGIE NEDERLAND B.V.',
    extra: ' ENERGIE',
  }),
];

mkdirSync(dirname(camtTarget), { recursive: true });
writeFileSync(
  camtTarget,
  `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>camt053-conformance</MsgId><CreDtTm>${today}T00:00:00</CreDtTm></GrpHdr>
    <Stmt>
      <Id>CONFORMANCE-1</Id>
      <CreDtTm>${today}T00:00:00</CreDtTm>
      <Acct><Id><IBAN>${IBAN}</IBAN></Id><Ccy>EUR</Ccy></Acct>
      <Bal><Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">500.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>${day(
        -30,
      )}</Dt></Dt></Bal>
      <FrDtTm>${day(-30)}T00:00:00</FrDtTm>
      <ToDtTm>${today}T23:59:59</ToDtTm>
${entries.join('\n')}
    </Stmt>
  </BkToCstmrStmt>
</Document>
`,
  'utf8',
);

/* ----------------------------------------------------------------- the store */

// Written as version 3 on purpose: the upgrade to version 4 is then part of
// what the installed application has to get right, on Windows, rather than
// something only the engine tests ever see.
function record(over) {
  return {
    kind: 'expense',
    categoryName: null,
    counterpartyKey: null,
    accountId: null,
    recurrence: { frequency: 'monthly', interval: 1 },
    endDate: null,
    state: 'confirmed',
    provenance: 'manual',
    mandateId: null,
    ...over,
  };
}

const store = {
  version: 3,
  imports: [],
  rules: [],
  provenance: {},
  decisions: {},
  aliases: [],
  accountFlags: {},
  occurrences: [],
  planned: [
    // Decided six months ago and never paid since. 03 §7.13: it keeps counting,
    // as due today, flagged, and no passage of time stops it. Under the rule
    // this replaces, everything older than ninety days would have vanished.
    record({
      id: 'plan-conf-overdue',
      name: 'Oude bijdrage',
      amountCents: 4_500,
      startDate: day(-180),
      createdAt: `${day(-180)}T09:00:00.000Z`,
      updatedAt: `${day(-180)}T09:00:00.000Z`,
    }),
    // Detected today in two years of statements. 03 §7.14: those two years are
    // history, not arrears, so this record is owed nothing at all.
    record({
      id: 'plan-conf-detected',
      name: 'Testsportschool',
      amountCents: 2_500,
      startDate: day(-730),
      state: 'suggested',
      provenance: 'detected',
      createdAt: `${today}T09:00:00.000Z`,
      updatedAt: `${today}T09:00:00.000Z`,
    }),
    // Decided two days ago, and the mandate the twins above carry. Both of them
    // qualify, so 03 §7.16 says neither is applied and a person is asked.
    record({
      id: 'plan-conf-twin',
      name: 'Testabonnement',
      amountCents: 2_495,
      startDate: day(-2),
      mandateId: MANDATE,
      createdAt: `${day(-2)}T09:00:00.000Z`,
      updatedAt: `${day(-2)}T09:00:00.000Z`,
    }),
  ],
};

mkdirSync(dirname(storeTarget), { recursive: true });
writeFileSync(storeTarget, JSON.stringify(store, null, 2), 'utf8');

process.stdout.write(
  `[ayq-fixture] today ${today}; statement ${camtTarget}; store ${storeTarget}\n`,
);
