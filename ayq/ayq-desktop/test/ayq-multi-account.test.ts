// PF-006: a bank export that reports on several accounts (CL_001, CL_002,
// CL_003 F1–F6).
//
// A bank hands over one ZIP with the statements of every account in it. AYQ
// used to import the whole ZIP into one account named after whichever file
// sorted first, and a later import of one account's statements then opened a
// second account on top of the first with the same money in it. These tests
// drive the real engine through the requests the renderer sends, against
// statements written here, and each would fail on the behaviour it replaces:
//
//   F1  every statement lands in the account its own IBAN names;
//   F2  a new account's kind is asked for once, and decides what counts;
//   F3  each opening balance is that account's own earliest statement opening;
//   F4  money moved between the owner's accounts is neither spending nor income;
//   F5  held in total, available funds, and a line for the term deposit;
//   F6  "agrees with the bank" only over one account's own statements.
//
// Three invented accounts: a payment account, free-access savings and a term
// deposit. €90,000 leaves the payment account for the deposit in July and comes
// back in August. Every IBAN, name and amount belongs to no one.

import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';

import { buildZip } from '../../ayq-camt/test/ayq-zip-writer.ts';
import { validateAnalyticalSnapshot } from '../../ayq-analytical-contract/src/index.ts';
import type { AyqAccountSummary } from '../../ayq-client/src/ayq-ipc-contract.ts';
import { ask, budget, restart, send } from './ayq-engine-harness.ts';

const PAYMENT = 'NL00TEST0011110001';
const SAVINGS = 'NL00TEST0022220002';
const DEPOSIT = 'NL00TEST0033330003';
const name = (iban: string) => `AYQ ${iban.slice(0, 2)}…${iban.slice(-4)}`;
const OWNER = 'J. TESTPERSOON';

type Entry = {
  date: string;
  cents: number;
  ref: string;
  /** A transfer to or from another account, by IBAN. */
  counter?: string;
  /** A card payment at a shop. */
  card?: boolean;
};

const money = (cents: number) => (Math.abs(cents) / 100).toFixed(2);
const side = (cents: number) => (cents < 0 ? 'DBIT' : 'CRDT');

function entryXml(entry: Entry): string {
  const head =
    `<Amt Ccy="EUR">${money(entry.cents)}</Amt><CdtDbtInd>${side(entry.cents)}</CdtDbtInd><Sts>BOOK</Sts>` +
    `<BookgDt><Dt>${entry.date}</Dt></BookgDt><ValDt><Dt>${entry.date}</Dt></ValDt>` +
    `<AcctSvcrRef>${entry.ref}</AcctSvcrRef>`;
  if (entry.counter !== undefined) {
    const out = entry.cents < 0;
    const party = out
      ? `<Cdtr><Nm>${OWNER}</Nm></Cdtr><CdtrAcct><Id><IBAN>${entry.counter}</IBAN></Id></CdtrAcct>`
      : `<Dbtr><Nm>${OWNER}</Nm></Dbtr><DbtrAcct><Id><IBAN>${entry.counter}</IBAN></Id></DbtrAcct>`;
    return (
      `<Ntry>${head}<BkTxCd><Domn><Cd>PMNT</Cd><Fmly><Cd>${out ? 'ICDT' : 'RCDT'}</Cd>` +
      `<SubFmlyCd>ESCT</SubFmlyCd></Fmly></Domn></BkTxCd><NtryDtls><TxDtls>` +
      `<Refs><EndToEndId>EIGEN-${entry.date}</EndToEndId></Refs><RltdPties>${party}</RltdPties>` +
      `<RmtInf><Ustrd>Eigen rekening</Ustrd></RmtInf></TxDtls></NtryDtls>` +
      `<AddtlNtryInf>SEPA Overboeking eigen rekening</AddtlNtryInf></Ntry>`
    );
  }
  if (entry.card === true) {
    return (
      `<Ntry>${head}<BkTxCd><Domn><Cd>PMNT</Cd><Fmly><Cd>CCRD</Cd><SubFmlyCd>POSD</SubFmlyCd>` +
      `</Fmly></Domn></BkTxCd><AddtlNtryInf>BEA, Betaalpas   TESTMARKT 4321,PAS421 NR:00B201, ` +
      `12.08.26/10:20   UTRECHT</AddtlNtryInf></Ntry>`
    );
  }
  return (
    `<Ntry>${head}<BkTxCd><Domn><Cd>ACMT</Cd><Fmly><Cd>MCOP</Cd><SubFmlyCd>OTHR</SubFmlyCd>` +
    `</Fmly></Domn></BkTxCd><AddtlNtryInf>Rente</AddtlNtryInf></Ntry>`
  );
}

function balanceXml(code: 'OPBD' | 'CLBD', cents: number, day: string): string {
  return (
    `<Bal><Tp><CdOrPrtry><Cd>${code}</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">${money(cents)}</Amt>` +
    `<CdtDbtInd>${cents < 0 ? 'DBIT' : 'CRDT'}</CdtDbtInd><Dt><Dt>${day}</Dt></Dt></Bal>`
  );
}

/** One month's CAMT.053 statement for one account; the closing is the bank's own arithmetic. */
function statement(iban: string, month: string, openingCents: number, entries: Entry[]): string {
  const from = `${month}-01`;
  const to = `${month}-${month.endsWith('-02') ? '28' : ['04', '06', '09', '11'].some(m => month.endsWith(m)) ? '30' : '31'}`;
  const closing = entries.reduce((sum, entry) => sum + entry.cents, openingCents);
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt>` +
    `<GrpHdr><MsgId>camt053-${iban}-${month}</MsgId><CreDtTm>${to}T23:59:59</CreDtTm></GrpHdr>` +
    `<Stmt><Id>${iban}.${month}</Id><CreDtTm>${to}T23:59:59</CreDtTm>` +
    `<FrToDt><FrDtTm>${from}T00:00:00</FrDtTm><ToDtTm>${to}T23:59:59</ToDtTm></FrToDt>` +
    `<Acct><Id><IBAN>${iban}</IBAN></Id><Ccy>EUR</Ccy><Ownr><Nm>${OWNER}</Nm></Ownr>` +
    `<Svcr><FinInstnId><BIC>ABNANL2A</BIC></FinInstnId></Svcr></Acct>` +
    balanceXml('OPBD', openingCents, from) +
    balanceXml('CLBD', closing, to) +
    entries.map(entryXml).join('') +
    `</Stmt></BkToCstmrStmt></Document>\n`
  );
}

// The payment account: €100,000 at the start of July, €90,000 to the deposit
// and €90,000 back, and two card payments.
const P_JULY = statement(PAYMENT, '2026-07', 10_000_000, [
  { date: '2026-07-05', cents: -2500, ref: 'P2026070500000001', card: true },
  { date: '2026-07-10', cents: -9_000_000, ref: 'P2026071000000002', counter: DEPOSIT },
]);
const P_AUGUST = statement(PAYMENT, '2026-08', 997_500, [
  { date: '2026-08-15', cents: 9_000_000, ref: 'P2026081500000003', counter: DEPOSIT },
  { date: '2026-08-20', cents: -4000, ref: 'P2026082000000004', card: true },
]);
const P_AUGUST_CLOSING = 997_500 + 9_000_000 - 4000;
// Free-access savings: €500 and a little interest.
const S_JULY = statement(SAVINGS, '2026-07', 50_000, [
  { date: '2026-07-31', cents: 100, ref: 'S2026073100000001' },
]);
const S_AUGUST = statement(SAVINGS, '2026-08', 50_100, [
  { date: '2026-08-31', cents: 100, ref: 'S2026083100000002' },
]);
// The term deposit: empty, then €90,000 for a month, then empty again.
const D_JULY = statement(DEPOSIT, '2026-07', 0, [
  { date: '2026-07-10', cents: 9_000_000, ref: 'D2026071000000001', counter: PAYMENT },
]);
const D_AUGUST = statement(DEPOSIT, '2026-08', 9_000_000, [
  { date: '2026-08-15', cents: -9_000_000, ref: 'D2026081500000002', counter: PAYMENT },
]);

/**
 * The whole export, as a bank ZIP: the deposit's files sort first, because
 * that is exactly the order that named everything after the deposit before.
 */
const EVERYTHING = [
  { name: 'a-000003-2026-07.xml', content: D_JULY },
  { name: 'a-000003-2026-08.xml', content: D_AUGUST },
  { name: 'b-000001-2026-07.xml', content: P_JULY },
  { name: 'b-000001-2026-08.xml', content: P_AUGUST },
  { name: 'c-000002-2026-07.xml', content: S_JULY },
  { name: 'c-000002-2026-08.xml', content: S_AUGUST },
];

async function zip(dataDir: string, file: string, entries: typeof EVERYTHING): Promise<string> {
  const path = join(dataDir, file);
  await writeFile(path, buildZip(entries));
  return path;
}

async function xml(dataDir: string, file: string, content: string): Promise<string> {
  const path = join(dataDir, file);
  await writeFile(path, content, 'utf8');
  return path;
}

function byName(accounts: AyqAccountSummary[], iban: string): AyqAccountSummary {
  const found = accounts.find(one => one.name === name(iban));
  assert.ok(found, `there is no account named ${name(iban)}`);
  return found;
}

async function importEverything(): Promise<string> {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [await zip(dataDir, 'export.zip', EVERYTHING)] });
  return dataDir;
}

test('F1: one ZIP of three accounts makes three accounts, each named by its own IBAN', async () => {
  const dataDir = await budget();
  const summary = await ask(dataDir, {
    kind: 'import.camt',
    paths: [await zip(dataDir, 'export.zip', EVERYTHING)],
  });

  assert.deepEqual(
    summary.accounts.map(one => one.accountName).sort(),
    [name(PAYMENT), name(SAVINGS), name(DEPOSIT)].sort(),
  );
  assert.ok(summary.accounts.every(one => one.created), 'each account was created by this import');
  assert.equal(summary.imported, 8, 'every movement of every account');

  const accounts = await ask(dataDir, { kind: 'accounts.list' });
  assert.equal(accounts.length, 3);
  // Each account holds its own movements and nothing of the others'.
  assert.equal(byName(accounts, PAYMENT).transactionCount, 4);
  assert.equal(byName(accounts, SAVINGS).transactionCount, 2);
  assert.equal(byName(accounts, DEPOSIT).transactionCount, 2);

  // One import record per account, so each account's history is its own.
  const history = await ask(dataDir, { kind: 'imports.list' });
  assert.deepEqual(
    history.map(one => one.accountName).sort(),
    [name(PAYMENT), name(SAVINGS), name(DEPOSIT)].sort(),
  );
});

test('F1: the file that sorts first names nothing but its own account', async () => {
  const dataDir = await budget();
  await ask(dataDir, {
    kind: 'import.camt',
    paths: [
      await zip(dataDir, 'two.zip', [
        { name: 'a-deposit.xml', content: D_JULY },
        { name: 'b-payment.xml', content: P_JULY },
      ]),
    ],
  });
  const accounts = await ask(dataDir, { kind: 'accounts.list' });
  assert.equal(accounts.length, 2);
  assert.equal(byName(accounts, DEPOSIT).transactionCount, 1, 'the deposit holds only its own movement');
  assert.equal(byName(accounts, PAYMENT).transactionCount, 2, 'the payment account holds its own two');
});

test('F1: single statements go to their own accounts, and a repeat adds nothing', async () => {
  const dataDir = await budget();
  const payment = await xml(dataDir, 'payment-july.xml', P_JULY);
  await ask(dataDir, { kind: 'import.camt', paths: [payment] });
  await ask(dataDir, { kind: 'import.camt', paths: [await xml(dataDir, 'deposit-july.xml', D_JULY)] });
  const again = await ask(dataDir, { kind: 'import.camt', paths: [payment] });

  assert.equal(again.accounts.length, 1);
  assert.equal(again.accounts[0].accountName, name(PAYMENT));
  assert.equal(again.accounts[0].created, false, 'a known account is not created again');
  assert.equal(again.imported, 0);
  assert.equal(again.duplicates, 2);
  const accounts = await ask(dataDir, { kind: 'accounts.list' });
  assert.equal(accounts.length, 2);
});

test('F3: each opening balance is that account’s own earliest statement opening, and nothing is counted twice', async () => {
  const dataDir = await budget();
  // July of both, then August of the payment account alone — the sequence that
  // opened a second account with the same money in it.
  await ask(dataDir, {
    kind: 'import.camt',
    paths: [
      await zip(dataDir, 'july.zip', [
        { name: 'a-deposit.xml', content: D_JULY },
        { name: 'b-payment.xml', content: P_JULY },
      ]),
    ],
  });
  await ask(dataDir, {
    kind: 'import.camt',
    paths: [await xml(dataDir, 'payment-august.xml', P_AUGUST)],
  });

  const view = await ask(dataDir, { kind: 'accounts.view' });
  assert.equal(view.accounts.length, 2, 'no second account for the same money');
  const payment = byName(view.accounts, PAYMENT);
  const deposit = byName(view.accounts, DEPOSIT);
  assert.equal(payment.balanceCents, P_AUGUST_CLOSING);
  assert.equal(deposit.balanceCents, 9_000_000);
  assert.equal(view.totalBalanceCents, P_AUGUST_CLOSING + 9_000_000);

  // The ledger is built on the payment account's own July opening: that
  // opening plus every movement AYQ holds is exactly the August closing.
  assert.ok(payment.reconciliation);
  const ledger = await ask(dataDir, { kind: 'transactions.list', filter: { accountId: payment.id } });
  const moved = ledger.rows.reduce((sum, row) => sum + row.amountCents, 0);
  assert.equal(payment.reconciliation.ledgerBalanceCents - moved, 10_000_000);
  assert.equal(payment.reconciliation.agrees, true);
});

test('F2: a new account is asked about once, and its kind decides what counts', async () => {
  const dataDir = await importEverything();
  let accounts = await ask(dataDir, { kind: 'accounts.list' });
  assert.ok(accounts.every(one => one.kindWanted), 'every new account waits for its question');
  assert.ok(accounts.every(one => one.kind?.template === null));
  assert.ok(accounts.every(one => one.kind?.currency === 'EUR'), 'the currency is read from the statement');

  const payment = byName(accounts, PAYMENT);
  const savings = byName(accounts, SAVINGS);
  const deposit = byName(accounts, DEPOSIT);
  await ask(dataDir, { kind: 'accounts.setKind', accountId: payment.id, template: 'payment' });
  await ask(dataDir, { kind: 'accounts.setKind', accountId: savings.id, template: 'savings' });
  accounts = await ask(dataDir, {
    kind: 'accounts.setKind',
    accountId: deposit.id,
    template: 'term-deposit',
    lockedUntil: '2027-07-10',
  });

  assert.ok(accounts.every(one => !one.kindWanted), 'answered once, asked no more');
  assert.equal(byName(accounts, PAYMENT).countsTowardFunds, true);
  assert.equal(byName(accounts, SAVINGS).countsTowardFunds, true);
  assert.equal(byName(accounts, DEPOSIT).countsTowardFunds, false);
  const kind = byName(accounts, DEPOSIT).kind;
  assert.ok(kind);
  assert.equal(kind.access, 'locked');
  assert.equal(kind.lockedUntil, '2027-07-10');
  assert.equal(kind.ownership, 'own');
  assert.equal(kind.nature, 'money');

  // Importing the same export again does not ask again.
  const again = await ask(dataDir, {
    kind: 'import.camt',
    paths: [await zip(dataDir, 'again.zip', EVERYTHING)],
  });
  assert.ok(again.accounts.every(one => !one.created && !one.kindWanted));

  // "Other — decide later" counts nothing until it is decided.
  accounts = await ask(dataDir, { kind: 'accounts.setKind', accountId: savings.id, template: 'other' });
  assert.equal(byName(accounts, SAVINGS).countsTowardFunds, false);

  // What the owner said survives a restart.
  await restart(dataDir);
  accounts = await ask(dataDir, { kind: 'accounts.list' });
  assert.equal(byName(accounts, DEPOSIT).kind?.lockedUntil, '2027-07-10');
  assert.equal(byName(accounts, SAVINGS).kind?.template, 'other');

  // A kind AYQ does not know changes nothing.
  const refused = await send(
    { id: 'kind-refused', kind: 'accounts.setKind', accountId: payment.id, template: 'mortgage' as never },
    dataDir,
  );
  assert.equal(refused.ok, false);
  assert.ok(!refused.ok && refused.code === 'account-kind-invalid');
});

test('F5: held in total, available funds, and the term deposit on its own line', async () => {
  const dataDir = await importEverything();
  const listed = await ask(dataDir, { kind: 'accounts.list' });
  await ask(dataDir, { kind: 'accounts.setKind', accountId: byName(listed, PAYMENT).id, template: 'payment' });
  await ask(dataDir, { kind: 'accounts.setKind', accountId: byName(listed, SAVINGS).id, template: 'savings' });
  await ask(dataDir, {
    kind: 'accounts.setKind',
    accountId: byName(listed, DEPOSIT).id,
    template: 'term-deposit',
  });

  const view = await ask(dataDir, { kind: 'accounts.view' });
  // Everything the owner holds, which is what the bank holds for him.
  assert.equal(view.totalBalanceCents, P_AUGUST_CLOSING + 50_200 + 0);
  // Spendable now or after a transfer: the payment account and the savings.
  assert.equal(view.availableFundsCents, P_AUGUST_CLOSING + 50_200);
  // The deposit is its own line, locked, with no date because none was given.
  assert.deepEqual(
    view.locked.map(one => [one.accountName, one.balanceCents, one.lockedUntil]),
    [[name(DEPOSIT), 0, null]],
  );

  const today = await ask(dataDir, { kind: 'today', today: '2026-09-01' });
  assert.equal(today.accounts.availableFundsCents, P_AUGUST_CLOSING + 50_200);
  assert.equal(today.accounts.locked.length, 1);
});

test('F4: the €90,000 out and back is an internal transfer in every total', async () => {
  const dataDir = await importEverything();

  // Reports: none of the four sides is income or spending.
  const spending = await ask(dataDir, {
    kind: 'spending',
    filter: { from: '2026-07-01', to: '2026-08-31' },
  });
  assert.equal(spending.transferCount, 4, 'both sides, both ways');
  assert.equal(spending.incomeCents, 200, 'only the interest came in');
  assert.equal(spending.totalCents, 6500, 'only the two card payments went out');

  // The Register names the other account on each side.
  const ledger = await ask(dataDir, { kind: 'transactions.list' });
  const transfers = ledger.rows.filter(row => row.transferWith !== null);
  assert.equal(transfers.length, 4);
  for (const row of transfers) {
    assert.notEqual(row.transferWith, row.account, 'a transfer names the other account');
    assert.equal(Math.abs(row.amountCents), 9_000_000);
  }

  // Nothing to file, and nothing counted as a counterparty to review.
  const summary = await ask(dataDir, { kind: 'summary' });
  assert.ok(
    summary.uncategorisedCount <= ledger.rows.length - 4,
    'a transfer is not waiting to be filed',
  );

  // The analytical snapshot links both sides of each movement (contract 1.x
  // already carries `internalTransfer`; nothing about the contract changes).
  const path = join(dataDir, 'snapshot.json');
  await ask(dataDir, { kind: 'snapshot.export', path, today: '2026-09-01' });
  const snapshot = validateAnalyticalSnapshot(JSON.parse(await readFile(path, 'utf8')));
  const linked = snapshot.transactions.filter(one => one.internalTransfer !== undefined);
  assert.equal(linked.length, 4);
  const pairs = new Map<string, number>();
  for (const one of linked) {
    pairs.set(one.internalTransfer!.pairKey, (pairs.get(one.internalTransfer!.pairKey) ?? 0) + 1);
  }
  assert.deepEqual([...pairs.values()].sort(), [2, 2], 'each movement is one pair of two sides');
});

test('F6: each account agrees with its own statements, and a gap is stated', async () => {
  const dataDir = await importEverything();
  let accounts = await ask(dataDir, { kind: 'accounts.list' });
  for (const iban of [PAYMENT, SAVINGS, DEPOSIT]) {
    const one = byName(accounts, iban);
    assert.ok(one.reconciliation, `${one.name} has nothing to compare`);
    assert.equal(one.reconciliation.asOf, '2026-08-31');
    assert.equal(one.reconciliation.agrees, true, `${one.name} does not agree with its own statements`);
    assert.equal(one.mixedStatements, false);
  }

  // A September statement that begins €100 lower than August closed: a
  // movement AYQ was never given. The difference is stated and left standing.
  const gapDir = await budget();
  await ask(gapDir, { kind: 'import.camt', paths: [await xml(gapDir, 'p-jul.xml', P_JULY)] });
  await ask(gapDir, { kind: 'import.camt', paths: [await xml(gapDir, 'p-aug.xml', P_AUGUST)] });
  const september = statement(PAYMENT, '2026-09', P_AUGUST_CLOSING - 10_000, [
    { date: '2026-09-03', cents: -1500, ref: 'P2026090300000005', card: true },
  ]);
  await ask(gapDir, { kind: 'import.camt', paths: [await xml(gapDir, 'p-sep.xml', september)] });
  accounts = await ask(gapDir, { kind: 'accounts.list' });
  const payment = byName(accounts, PAYMENT);
  assert.ok(payment.reconciliation);
  assert.equal(payment.reconciliation.agrees, false);
  assert.equal(payment.reconciliation.differenceCents, -10_000);
  // The balance is still the bank's own figure (03 §10.1).
  assert.equal(payment.balanceCents, P_AUGUST_CLOSING - 10_000 - 1500);
});

test('F6: statements of more than one account are never shown as agreeing', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [await xml(dataDir, 'p-jul.xml', P_JULY)] });

  // What an earlier AYQ left behind: evidence under this account from a
  // statement that reported on another. Written into the store the way the
  // defective import wrote it.
  const storePath = join(dataDir, 'ayq-store.json');
  const store = JSON.parse(await readFile(storePath, 'utf8')) as {
    evidence: Array<Record<string, unknown>>;
  };
  const own = store.evidence[0];
  store.evidence.push({ ...own, file: 'other-account.xml', statementAccount: name(DEPOSIT) });
  await writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');

  const accounts = await ask(dataDir, { kind: 'accounts.list' });
  const payment = byName(accounts, PAYMENT);
  assert.equal(payment.mixedStatements, true);
  assert.equal(payment.reconciliation, null, 'mixed statements were compared');

  const view = await ask(dataDir, { kind: 'accounts.view' });
  assert.equal(view.coverage[0].agrees, null);
});
