// Writes an invented statement large enough to have a second page.
//
// The committed fixture is fourteen entries, which is the right size for
// proving what an import does and the wrong size for proving anything about a
// ledger that draws five hundred rows at a time. So a bigger one is generated
// rather than committed: six hundred kilobytes of invented data in the
// repository would be six hundred kilobytes nobody ever reads.
//
// Everything in it is made up. The IBAN is a test number, the shops do not
// exist, and the amounts are arithmetic. A real statement never enters this
// repository and never reaches CI.

import { writeFileSync } from 'node:fs';

const [, , target = 'ayq-scale.xml', wanted = '900'] = process.argv;
const count = Number(wanted);

const shops = ['TESTMARKT', 'TESTFUEL', 'KOFFIEHUIS DE TEST', 'TESTAPOTHEEK'];
const entries = [];

// Deterministic: the same file every time, so a failure is the code's and never
// the fixture's.
for (let index = 0; index < count; index += 1) {
  const day = (index % 28) + 1;
  const month = (Math.floor(index / 28) % 12) + 1;
  const year = 2024 + Math.floor(index / (28 * 12));
  const shop = shops[index % shops.length];
  const cents = 250 + ((index * 137) % 9000);
  const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  entries.push(`      <Ntry>
        <Amt Ccy="EUR">${(cents / 100).toFixed(2)}</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts>BOOK</Sts>
        <BookgDt><Dt>${date}</Dt></BookgDt><ValDt><Dt>${date}</Dt></ValDt>
        <AcctSvcrRef>SCALE${String(index).padStart(10, '0')}</AcctSvcrRef>
        <BkTxCd><Domn><Cd>PMNT</Cd><Fmly><Cd>CCRD</Cd><SubFmlyCd>POSD</SubFmlyCd></Fmly></Domn></BkTxCd>
        <AddtlNtryInf>BEA, Betaalpas   ${shop} ${1000 + (index % 900)},PAS421 NR:00A${String(index % 999).padStart(3, '0')}, ${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${String(year).slice(2)}/1${index % 10}:${10 + (index % 49)}   AMSTERDAM</AddtlNtryInf>
      </Ntry>`);
}

writeFileSync(
  target,
  `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>camt053-scale</MsgId><CreDtTm>2026-01-01T00:00:00</CreDtTm></GrpHdr>
    <Stmt>
      <Id>NL00TEST0123456789.scale</Id>
      <LglSeqNb>1</LglSeqNb>
      <CreDtTm>2026-01-01T00:00:00</CreDtTm>
      <FrToDt><FrDtTm>2024-01-01T00:00:00</FrDtTm><ToDtTm>2026-12-31T23:59:59</ToDtTm></FrToDt>
      <Acct>
        <Id><IBAN>NL00TEST0123456789</IBAN></Id><Ccy>EUR</Ccy>
        <Ownr><Nm>J. TESTPERSOON</Nm></Ownr>
        <Svcr><FinInstnId><BIC>ABNANL2A</BIC></FinInstnId></Svcr>
      </Acct>
${entries.join('\n')}
    </Stmt>
  </BkToCstmrStmt>
</Document>
`,
  'utf8',
);

process.stdout.write(`ayq-desktop: ${target} (${count} invented entries)\n`);
