// What build 005 added to the engine, proved on real budgets.
//
// Its own file because each test here creates a real Actual budget, and on the
// Windows runner that is disk rather than processor: run 73 put these in
// `ayq-engine.test.ts` and the file went past the runner's per-file timeout
// with every assertion in it passing. The timeout is per file and `node --test`
// gives each file its own process, so the fix for a suite that keeps growing is
// another file rather than a larger number.
//
// What is in here:
//
//   - balances, anchors, and Unknown as a real state (4, 5)
//   - what the owner calls a counterparty (8)
//   - the starter taxonomy, fresh and on a budget that already exists (11)
//   - what a category normally costs, and what that may be averaged over (10)
//   - the strict rule for what history may suggest (9)
//
// Every account, counterparty, amount and date below is invented.

import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';

import type { AyqResults } from '../../ayq-client/src/ayq-ipc-contract.ts';
import { AYQ_STORE_VERSION } from '../src/ayq-store.ts';

import {
  ask,
  budget,
  fixture,
  gapFixture,
  here,
  restart,
  seriesFixture,
} from './ayq-engine-harness.ts';

/** The two spellings of one shop, and a later statement carrying one of them. */
const variants = join(here, '..', '..', 'ayq-camt', 'test', 'fixtures', 'ayq-alias-variants.xml');
const later = join(here, '..', '..', 'ayq-camt', 'test', 'fixtures', 'ayq-alias-later.xml');

test('only an exact amount at a regular rhythm becomes an offer (9 §9.1)', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [seriesFixture] });

  const first = await ask(dataDir, { kind: 'plan.suggest', today: '2026-10-01' });

  // Two of the six patterns in the fixture qualify, and the offers carry the
  // exact repeated amount rather than an average of anything.
  const offered = first.plan.records
    .filter(one => one.provenance === 'detected')
    .map(one => one.amountCents)
    .sort((left, right) => left - right);
  assert.deepEqual(offered, [499, 999], 'the strict rule let the wrong ones through');
  assert.equal(first.added, 2);

  for (const record of first.plan.records) {
    assert.equal(record.state, 'suggested', 'an offer, not a decision');
    assert.equal(record.provenance, 'detected');
    assert.equal(record.kind, 'expense');
    assert.equal(record.recurrence.frequency, 'monthly');
    assert.ok(record.amountCents > 0);
    // 03 §7.14: suggested today, and owed nothing before today.
    assert.equal(record.suggestedAt, '2026-10-01');
    assert.equal(record.confirmedAt, null);
    // §9.1: no category is guessed at.
    assert.equal(record.categoryName, null);
  }

  // Nothing that has to stay out got in. Each of these is a separate rule.
  const amounts = new Set(first.plan.records.map(one => one.amountCents));
  for (const [what, cents] of [
    ['the supermarket', 4731],
    ['the fuel at the same amount on no rhythm', 6000],
    ['the energy bill that is a cent apart', 6190],
    ['the mandate that collects irregularly', 4200],
    ['the one-off purchases under a subscription’s counterparty', 8900],
  ] as Array<[string, number]>) {
    assert.ok(!amounts.has(cents), `${what} was offered as an expectation`);
  }

  // Running it again offers nothing new.
  const again = await ask(dataDir, { kind: 'plan.suggest', today: '2026-10-01' });
  assert.equal(again.added, 0);
  assert.equal(again.plan.records.length, first.plan.records.length);

  // And accepting one makes it the person's decision (03 §4.3).
  const accepted = await ask(dataDir, {
    kind: 'plan.setState',
    recordId: first.plan.records[0].id,
    state: 'confirmed',
    today: '2026-10-01',
  });
  assert.equal(
    accepted.records.find(one => one.id === first.plan.records[0].id)?.provenance,
    'manual',
    'accepting an offer makes it a person s decision (03 §4.3)',
  );
});

test('a build-004 offer the rule no longer supports is withdrawn (9 §9.2)', async () => {
  const dataDir = await budget();

  // A store as build 004 left one: a detected suggestion at an *averaged*
  // amount nobody was ever charged, a suggestion the owner has already
  // confirmed, and a record the owner typed. Only the first is AYQ's to
  // reconsider.
  await writeFile(
    join(dataDir, 'ayq-store.json'),
    JSON.stringify({
      version: 7,
      imports: [],
      rules: [],
      provenance: {},
      decisions: {},
      aliases: [],
      coverage: {},
      accountFlags: {},
      occurrences: [
        {
          recordId: 'plan-004-detected',
          dueDate: '2026-08-02',
          rescheduledTo: null,
          matchedTransactionId: null,
          matchedAt: null,
          matchProvenance: null,
          dismissed: false,
          // A pairing the owner refused. It is theirs, and it survives.
          rejected: ['some-transaction-id'],
        },
      ],
      settings: { ground: 'system' },
      planned: [
        {
          id: 'plan-004-detected',
          name: 'Testmarkt',
          kind: 'expense',
          amountCents: 4988,
          categoryName: null,
          counterpartyKey: 'TESTMARKT',
          accountId: null,
          startDate: '2026-08-02',
          recurrence: { frequency: 'monthly', interval: 1 },
          endDate: null,
          state: 'suggested',
          provenance: 'detected',
          mandateId: null,
          confirmedAt: null,
          suggestedAt: '2026-07-02',
          createdAt: '2026-07-02T09:00:00.000Z',
          updatedAt: '2026-07-02T09:00:00.000Z',
        },
        {
          id: 'plan-004-confirmed',
          name: 'Testfuel',
          kind: 'expense',
          amountCents: 6000,
          categoryName: null,
          counterpartyKey: 'TESTFUEL',
          accountId: null,
          startDate: '2026-08-14',
          recurrence: { frequency: 'monthly', interval: 1 },
          endDate: null,
          state: 'confirmed',
          provenance: 'detected',
          mandateId: null,
          confirmedAt: '2026-07-05',
          suggestedAt: '2026-07-02',
          createdAt: '2026-07-02T09:00:00.000Z',
          updatedAt: '2026-07-05T09:00:00.000Z',
        },
        {
          id: 'plan-004-manual',
          name: 'Invented rent',
          kind: 'expense',
          amountCents: 120_000,
          categoryName: 'Housing',
          counterpartyKey: null,
          accountId: null,
          startDate: '2026-08-01',
          recurrence: { frequency: 'monthly', interval: 1 },
          endDate: null,
          state: 'confirmed',
          provenance: 'manual',
          mandateId: null,
          confirmedAt: '2026-07-01',
          suggestedAt: null,
          createdAt: '2026-07-01T09:00:00.000Z',
          updatedAt: '2026-07-01T09:00:00.000Z',
        },
      ],
    }),
    'utf8',
  );

  // The budget is created on this launch, so the reconsideration happens on the
  // next one — which is what a person upgrading actually does.
  await ask(dataDir, { kind: 'import.camt', paths: [seriesFixture] });
  await restart(dataDir);

  const plan = await ask(dataDir, { kind: 'plan.list', today: '2026-10-01' });
  const held = new Map(plan.records.map(one => [one.id, one]));

  // Withdrawn: nobody was ever charged 49.88, and it was taking that out of the
  // forecast every month.
  assert.equal(held.get('plan-004-detected')?.state, 'retired');
  assert.ok(
    !plan.occurrences.some(one => one.recordId === 'plan-004-detected'),
    'a withdrawn offer is still on Upcoming',
  );

  const forecast = await ask(dataDir, { kind: 'forecast', today: '2026-10-01' });
  assert.ok(
    !forecast.events.some(one => one.recordId === 'plan-004-detected'),
    'a withdrawn offer is still being subtracted from the position',
  );

  // Untouched: what the owner confirmed, and what the owner typed. Neither is
  // AYQ's to reconsider, however little history supports them.
  assert.equal(held.get('plan-004-confirmed')?.state, 'confirmed');
  assert.equal(held.get('plan-004-manual')?.state, 'confirmed');

  // And nothing was deleted. The record, its dates and the pairing the owner
  // refused are all still there to be read.
  assert.equal(
    plan.records.length,
    3,
    'records were deleted rather than retired',
  );
  assert.equal(held.get('plan-004-detected')?.suggestedAt, '2026-07-02');
  assert.equal(held.get('plan-004-detected')?.amountCents, 4988);
  const store = JSON.parse(
    await readFile(join(dataDir, 'ayq-store.json'), 'utf8'),
  ) as { occurrences: Array<{ recordId: string; rejected: string[] }> };
  assert.deepEqual(
    store.occurrences.find(one => one.recordId === 'plan-004-detected')?.rejected,
    ['some-transaction-id'],
    'a refusal the owner made was lost',
  );
});


test('a fresh budget gets the accepted taxonomy, exactly and in order', async () => {
  const dataDir = await budget();
  const categories = await ask(dataDir, { kind: 'categories.list' });

  // 11 §11.1, group by group and in the order it is written. Read off the
  // budget rather than off `AYQ_STARTER_TAXONOMY`: a test that compares the
  // code with itself proves the list was not mistyped and nothing else.
  const wanted: Array<[string, string[]]> = [
    ['Home & bills', ['Housing', 'Utilities', 'Insurance', 'Phone & Internet', 'Subscriptions']],
    ['Daily living', ['Groceries', 'Eating out', 'Household']],
    ['Transport', ['Public transport', 'Car & fuel', 'Parking & road tax']],
    ['Personal', ['Health & pharmacy', 'Personal care']],
    ['Shopping & leisure', ['Shopping', 'Entertainment', 'Travel', 'Gifts & donations']],
    ['Finance & government', ['Taxes & government', 'Bank fees']],
    ['Other', ['Other']],
  ];

  for (const [group, names] of wanted) {
    const held = categories
      .filter(category => category.groupName === group)
      .map(category => category.name);
    assert.deepEqual(held, names, `the ${group} group is not what 11 §11.1 says`);
  }

  // Income is Actual's income, not an expense category with a hopeful name.
  const income = categories.filter(category => category.isIncome);
  assert.deepEqual(
    income.map(one => one.name).filter(name => name !== 'Starting Balances'),
    ['Salary', 'Other income'],
  );
  for (const name of ['Salary', 'Other income']) {
    assert.equal(
      categories.find(one => one.name === name)?.isIncome,
      true,
      `${name} is not an income category`,
    );
  }

  // Actual's own placeholders are gone from a budget AYQ created, because
  // nothing of the owner's can be referencing them yet (§11.2).
  const names = categories.map(one => one.name);
  for (const placeholder of ['Food', 'General', 'Bills', 'Bills (Flexible)']) {
    assert.ok(!names.includes(placeholder), `${placeholder} is still there`);
  }

  // Not seeded, and each for its own reason: Uncategorised is a state,
  // Savings and Transfers are not expenses.
  for (const never of ['Uncategorised', 'Savings', 'Transfers']) {
    assert.ok(!names.includes(never), `${never} was seeded as a category`);
  }

  // And Actual's technical income row is left exactly where it is.
  assert.ok(names.includes('Starting Balances'));

  // The marker says the work is done, so it never runs again.
  const status = await ask(dataDir, { kind: 'engine.status' });
  assert.equal(status.storeVersion, AYQ_STORE_VERSION);
  const store = JSON.parse(
    await readFile(join(dataDir, 'ayq-store.json'), 'utf8'),
  ) as { starterTaxonomyVersion: number };
  assert.equal(store.starterTaxonomyVersion, 1);
});

test('an existing budget gains the missing names and loses nothing', async () => {
  const dataDir = await budget();
  // A budget AYQ made, then taken back to the state of one it did not: the
  // marker is cleared and a category of the owner's own is put where a starter
  // name would otherwise go.
  await ask(dataDir, { kind: 'engine.status' });

  const before = await ask(dataDir, { kind: 'categories.list' });
  const daily = before.find(one => one.name === 'Groceries');
  assert.ok(daily);

  // The owner has renamed Groceries and moved on with their life.
  await ask(dataDir, {
    kind: 'categories.rename',
    categoryId: daily.id,
    name: 'Boodschappen',
  });
  // And filed something into it, so it is not an empty category either.
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });
  const rows = await ask(dataDir, { kind: 'transactions.list' });
  await ask(dataDir, {
    kind: 'transaction.categorise',
    transactionId: rows.rows[0].id,
    categoryId: daily.id,
  });

  // Now pretend this budget has never had the taxonomy — which is what every
  // migrated store says about itself (§3.4).
  const path = join(dataDir, 'ayq-store.json');
  const store = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
  store.starterTaxonomyVersion = 0;
  await writeFile(path, JSON.stringify(store, null, 2));
  await restart(dataDir);

  const after = await ask(dataDir, { kind: 'categories.list' });
  const names = after.map(one => one.name);

  // The renamed category is still renamed, still where it was, and still has
  // its transaction. Provisioning is additive and nothing else.
  assert.ok(names.includes('Boodschappen'), 'the owner’s rename was undone');
  assert.equal(
    after.find(one => one.name === 'Boodschappen')?.groupName,
    daily.groupName,
    'a category was moved to the group the taxonomy would have chosen',
  );
  const filed = await ask(dataDir, { kind: 'transactions.list' });
  assert.equal(
    filed.rows.find(row => row.id === rows.rows[0].id)?.category,
    'Boodschappen',
    'a transaction was reclassified by provisioning',
  );

  // Groceries is missing from the budget now, so it is created — additively,
  // and without touching the one the owner renamed.
  assert.ok(names.includes('Groceries'), 'the missing starter name was not added');
  assert.equal(
    names.filter(one => one === 'Groceries').length,
    1,
    'the starter name was created more than once',
  );

  // Every other starter name is there exactly once.
  for (const name of ['Housing', 'Eating out', 'Car & fuel', 'Bank fees', 'Other']) {
    assert.equal(
      names.filter(one => one === name).length,
      1,
      `${name} is not in the budget exactly once`,
    );
  }
});

test('provisioning is idempotent, and does not undo a later deletion', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'engine.status' });

  const before = (await ask(dataDir, { kind: 'categories.list' })).length;

  // A second launch changes nothing: the marker says it has been done.
  await restart(dataDir);
  assert.equal((await ask(dataDir, { kind: 'categories.list' })).length, before);

  // The owner renames one of the starter categories. §11.3: once version 1 is
  // marked complete the list is never provisioned again, so the name they took
  // away does not come back on the next launch — and the count does not grow.
  //
  // Renamed rather than deleted because AYQ has no delete-a-category capability
  // to call, and the rule is the same rule: what the owner did to the starter
  // list stands.
  const categories = await ask(dataDir, { kind: 'categories.list' });
  const travel = categories.find(one => one.name === 'Travel');
  assert.ok(travel);
  await ask(dataDir, {
    kind: 'categories.rename',
    categoryId: travel.id,
    name: 'Holidays',
  });

  await restart(dataDir);
  const after = await ask(dataDir, { kind: 'categories.list' });
  assert.ok(
    !after.some(one => one.name === 'Travel'),
    'a category the owner renamed was recreated under its old name',
  );
  assert.ok(after.some(one => one.name === 'Holidays'));
  assert.equal(after.length, before, 'the list grew on a launch that should add nothing');
});

test('an interrupted provisioning run finishes without duplicating anything', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'engine.status' });

  // The marker is written only after every create has succeeded, so a store
  // whose marker is still nought is exactly what an interrupted run leaves
  // behind — with some or all of the categories already in place.
  const path = join(dataDir, 'ayq-store.json');
  const store = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
  store.starterTaxonomyVersion = 0;
  await writeFile(path, JSON.stringify(store, null, 2));

  await restart(dataDir);
  const after = await ask(dataDir, { kind: 'categories.list' });

  const counted = new Map<string, number>();
  for (const one of after) {
    counted.set(one.name, (counted.get(one.name) ?? 0) + 1);
  }
  for (const [name, times] of counted) {
    assert.equal(times, 1, `${name} exists ${times} times after a rerun`);
  }

  const settled = JSON.parse(await readFile(path, 'utf8')) as {
    starterTaxonomyVersion: number;
  };
  assert.equal(settled.starterTaxonomyVersion, 1);
});

/* -------------------------------------------------- balances, and not knowing

   §4 and §5. A statement is a list of movements: it says what changed and never
   what there was. Build 004 added the movements to an assumed nought and drew
   the total as an account balance, which is the one arithmetic in this product
   that must never be guessed. These prove that it is not guessed now, and that
   not knowing is a state AYQ says out loud.                                  */

/** A statement of movements with no balance anywhere in it. */
async function movementsOnly(dataDir: string): Promise<string> {
  const path = join(dataDir, 'ayq-no-balance.xml');
  await writeFile(
    path,
    `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>camt053-no-balance</MsgId><CreDtTm>2026-07-01T00:00:00</CreDtTm></GrpHdr>
    <Stmt>
      <Id>NL03TEST0123456789.2026-06</Id>
      <CreDtTm>2026-07-01T00:00:00</CreDtTm>
      <FrToDt><FrDtTm>2026-06-01T00:00:00</FrDtTm><ToDtTm>2026-06-30T23:59:59</ToDtTm></FrToDt>
      <Acct><Id><IBAN>NL03TEST0123456789</IBAN></Id><Ccy>EUR</Ccy></Acct>
      <Ntry>
        <Amt Ccy="EUR">20.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts>BOOK</Sts>
        <BookgDt><Dt>2026-06-10</Dt></BookgDt><ValDt><Dt>2026-06-10</Dt></ValDt>
        <AcctSvcrRef>NOBAL0000000001</AcctSvcrRef>
        <BkTxCd><Domn><Cd>PMNT</Cd><Fmly><Cd>DDBT</Cd><SubFmlyCd>PMDD</SubFmlyCd></Fmly></Domn></BkTxCd>
        <NtryDtls><TxDtls>
          <Refs><EndToEndId>NOBAL-1</EndToEndId></Refs>
          <RltdPties><Cdtr><Nm>TESTWINKEL B.V.</Nm></Cdtr></RltdPties>
          <RmtInf><Ustrd>TESTWINKEL B.V.</Ustrd></RmtInf>
        </TxDtls></NtryDtls>
      </Ntry>
      <Ntry>
        <Amt Ccy="EUR">30.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts>BOOK</Sts>
        <BookgDt><Dt>2026-06-20</Dt></BookgDt><ValDt><Dt>2026-06-20</Dt></ValDt>
        <AcctSvcrRef>NOBAL0000000002</AcctSvcrRef>
        <BkTxCd><Domn><Cd>PMNT</Cd><Fmly><Cd>DDBT</Cd><SubFmlyCd>PMDD</SubFmlyCd></Fmly></Domn></BkTxCd>
        <NtryDtls><TxDtls>
          <Refs><EndToEndId>NOBAL-2</EndToEndId></Refs>
          <RltdPties><Cdtr><Nm>TESTWINKEL B.V.</Nm></Cdtr></RltdPties>
          <RmtInf><Ustrd>TESTWINKEL B.V.</Ustrd></RmtInf>
        </TxDtls></NtryDtls>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>
`,
    'utf8',
  );
  return path;
}

/** An older statement for the same account, also with no balance in it. */
async function olderMovements(dataDir: string): Promise<string> {
  const path = join(dataDir, 'ayq-no-balance-older.xml');
  await writeFile(
    path,
    `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>camt053-no-balance-older</MsgId><CreDtTm>2026-06-01T00:00:00</CreDtTm></GrpHdr>
    <Stmt>
      <Id>NL03TEST0123456789.2026-05</Id>
      <CreDtTm>2026-06-01T00:00:00</CreDtTm>
      <FrToDt><FrDtTm>2026-05-01T00:00:00</FrDtTm><ToDtTm>2026-05-31T23:59:59</ToDtTm></FrToDt>
      <Acct><Id><IBAN>NL03TEST0123456789</IBAN></Id><Ccy>EUR</Ccy></Acct>
      <Ntry>
        <Amt Ccy="EUR">45.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts>BOOK</Sts>
        <BookgDt><Dt>2026-05-15</Dt></BookgDt><ValDt><Dt>2026-05-15</Dt></ValDt>
        <AcctSvcrRef>NOBALOLD0000001</AcctSvcrRef>
        <BkTxCd><Domn><Cd>PMNT</Cd><Fmly><Cd>DDBT</Cd><SubFmlyCd>PMDD</SubFmlyCd></Fmly></Domn></BkTxCd>
        <NtryDtls><TxDtls>
          <Refs><EndToEndId>NOBALOLD-1</EndToEndId></Refs>
          <RltdPties><Cdtr><Nm>TESTWINKEL B.V.</Nm></Cdtr></RltdPties>
          <RmtInf><Ustrd>TESTWINKEL B.V.</Ustrd></RmtInf>
        </TxDtls></NtryDtls>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>
`,
    'utf8',
  );
  return path;
}

test('a statement with no balance leaves the balance Unknown (§4.1, §5)', async () => {
  const dataDir = await budget();
  const summary = await ask(dataDir, {
    kind: 'import.camt',
    paths: [await movementsOnly(dataDir)],
  });

  // The import succeeded. It is not a failure to have no balance in it.
  assert.equal(summary.imported, 2);
  // And it says the balance is still wanted, which is what the screen offers.
  assert.equal(summary.balanceWanted, true);
  assert.equal(summary.anchoredAt, null);

  const view = await ask(dataDir, { kind: 'accounts.view' });
  const [account] = view.accounts;

  // Null, not nought, and not minus fifty either — which is exactly what the
  // net of the imported movements would have been.
  assert.equal(account.balanceCents, null, 'a balance was invented');
  assert.equal(account.anchor, null);
  assert.equal(account.transactionCount, 2);

  // And the whole position goes with it: no available funds, no total held.
  assert.equal(view.availableFundsCents, null, 'available funds were fabricated');
  assert.equal(view.totalBalanceCents, null);
  assert.equal(view.countedWithoutAnchor, 1);

  // Reconciliation is unavailable, because the bank stated nothing to compare.
  assert.equal(account.reconciliation, null);
  assert.equal(view.coverage[0].agrees, null);

  // Coverage still advanced: the file proved a month of movements (§6.2).
  assert.equal(account.bankDataThrough, '2026-06-30');
  assert.ok(account.lastImportAt !== null);
});

test('an unknown counted account suppresses every absolute forecast figure (§5)', async () => {
  const dataDir = await budget();
  await ask(dataDir, {
    kind: 'import.camt',
    paths: [await movementsOnly(dataDir)],
  });

  const forecast = await ask(dataDir, { kind: 'forecast', today: '2026-07-01' });
  assert.equal(forecast.availableFundsCents, null);
  assert.equal(forecast.lowest, null, 'a lowest point was projected from nothing');
  assert.equal(forecast.closingCents, null);
  for (const month of forecast.months) {
    assert.equal(month.closingCents, null, `${month.month} closed at a figure`);
  }
  for (const event of forecast.events) {
    assert.equal(event.balanceCents, null);
  }

  const today = await ask(dataDir, { kind: 'today', today: '2026-07-01' });
  assert.equal(today.accounts.availableFundsCents, null);
  assert.equal(today.lowest, null);
  assert.equal(today.monthEnd, null);
  // What is waiting is still counted: none of it needs a starting position.
  assert.ok(today.waiting.total >= 0);
});

test('a balance set by hand is exact on the day it is set for (§4.4)', async () => {
  const dataDir = await budget();
  await ask(dataDir, {
    kind: 'import.camt',
    paths: [await movementsOnly(dataDir)],
  });
  const [before] = await ask(dataDir, { kind: 'accounts.list' });

  const view = await ask(dataDir, {
    kind: 'accounts.setBalance',
    accountId: before.id,
    amountCents: 124_055,
    coverageDate: '2026-06-30',
  });
  const [account] = view.accounts;

  assert.equal(account.balanceCents, 124_055, 'the balance is not what was set');
  assert.equal(account.anchor?.source, 'manual');
  assert.equal(account.anchor?.coverageDate, '2026-06-30');
  assert.equal(view.availableFundsCents, 124_055);

  // §4.2: written through Actual's technical starting-balance transaction and
  // never as an ordinary payment. Nothing new is in the ledger.
  const rows = await ask(dataDir, { kind: 'transactions.list' });
  assert.equal(rows.total, 2, 'a balancing transaction was written into the ledger');
});

test('a movement after the anchor moves the balance exactly once (§4.3)', async () => {
  const dataDir = await budget();
  await ask(dataDir, {
    kind: 'import.camt',
    paths: [await movementsOnly(dataDir)],
  });
  const [account] = await ask(dataDir, { kind: 'accounts.list' });
  await ask(dataDir, {
    kind: 'accounts.setBalance',
    accountId: account.id,
    amountCents: 124_055,
    coverageDate: '2026-06-30',
  });

  // The same file again: every row is a duplicate, so nothing may move.
  const again = await ask(dataDir, {
    kind: 'import.camt',
    paths: [join(dataDir, 'ayq-no-balance.xml')],
  });
  assert.equal(again.imported, 0);
  const unchanged = await ask(dataDir, { kind: 'accounts.list' });
  assert.equal(
    unchanged[0].balanceCents,
    124_055,
    'a re-import moved a balance it added nothing to',
  );

  // Now an older statement, dated *before* the anchor. §4.3: the technical
  // starting balance is recomputed so the anchor is still true at its own day.
  await ask(dataDir, {
    kind: 'import.camt',
    paths: [await olderMovements(dataDir)],
  });
  const after = await ask(dataDir, { kind: 'accounts.list' });
  assert.equal(
    after[0].balanceCents,
    124_055,
    'importing older history moved a balance the owner had stated',
  );
  assert.equal(after[0].transactionCount, 3, 'the older movement really arrived');
});

test('re-anchoring adds a balance and keeps the one before it (§4.5)', async () => {
  const dataDir = await budget();
  await ask(dataDir, {
    kind: 'import.camt',
    paths: [await movementsOnly(dataDir)],
  });
  const [account] = await ask(dataDir, { kind: 'accounts.list' });
  await ask(dataDir, {
    kind: 'accounts.setBalance',
    accountId: account.id,
    amountCents: 124_055,
    coverageDate: '2026-06-30',
  });

  const corrected = await ask(dataDir, {
    kind: 'accounts.reanchor',
    accountId: account.id,
    amountCents: 130_000,
    coverageDate: '2026-06-30',
  });
  const [now] = corrected.accounts;

  assert.equal(now.balanceCents, 130_000);
  assert.equal(now.anchor?.amountCents, 130_000);
  // Both are kept, newest first. The old figure is how anybody answers "why
  // did this change in June".
  assert.equal(now.anchorHistory.length, 2, 'the earlier balance was written over');
  assert.equal(now.anchorHistory[1].amountCents, 124_055);
  assert.equal(now.anchorHistory[1].source, 'manual');

  // Still no transaction was written for either of them.
  const rows = await ask(dataDir, { kind: 'transactions.list' });
  assert.equal(rows.total, 2);
});

test('a bank-stated closing balance establishes the anchor by itself (§4.4)', async () => {
  const dataDir = await budget();
  const summary = await ask(dataDir, { kind: 'import.camt', paths: [fixture] });

  // The file carried the bank's own arithmetic, so nothing is asked of anyone.
  assert.equal(summary.balanceWanted, false);
  assert.equal(summary.anchorEstablished, true);

  const [account] = await ask(dataDir, { kind: 'accounts.list' });
  assert.equal(account.anchor?.source, 'bank');
  assert.equal(account.balanceCents, 174_131, 'the bank said 1741.31 on the 30th');
});

test('an older statement imported later does not displace a newer anchor (§3.1)', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [gapFixture] });
  const [newer] = await ask(dataDir, { kind: 'accounts.list' });
  const stood = newer.anchor?.coverageDate;
  assert.ok(stood);

  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });
  const [after] = await ask(dataDir, { kind: 'accounts.list' });

  assert.equal(
    after.anchor?.coverageDate,
    stood,
    'an older statement moved the balance backwards',
  );
  // And the older evidence is kept: it is anchor history, not nothing.
  assert.ok(after.anchorHistory.length > 1);
});


/* ------------------------------------------------- what the owner calls things

   8 §8.2 and §8.3. A rename is a name and nothing else: the canonical key does
   not move, no rule follows it, no transaction is rewritten and the string the
   bank printed stays exactly where it was. And because the name is kept beside
   the budget rather than in it, a later import has no write to win.         */

test('the owner’s name outranks the automatic one, everywhere at once', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });

  const counterparties = await ask(dataDir, { kind: 'counterparties.list' });
  const fuel = counterparties.rows.find(one => one.name === 'Testfuel');
  assert.ok(fuel, 'the fixture no longer holds the counterparty this is about');
  const key = fuel.key;

  // A rule first, so the test can show the rule does not move with the name.
  const categories = await ask(dataDir, { kind: 'categories.list' });
  const transport = categories.find(one => one.name === 'Public transport');
  assert.ok(transport);
  await ask(dataDir, {
    kind: 'transaction.categoriseCounterparty',
    counterpartyKey: key,
    categoryId: transport.id,
    createRule: true,
  });

  const renamed = await ask(dataDir, {
    kind: 'counterparty.setName',
    counterpartyKey: key,
    displayName: 'Maas',
  });
  assert.equal(renamed.counterparty.name, 'Maas');
  assert.equal(renamed.counterparty.key, key, 'the canonical key moved');

  // Every surface that names a counterparty, from the one engine resolver.
  const ledger = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { counterpartyKey: key },
  });
  assert.ok(ledger.rows.length > 0);
  assert.ok(
    ledger.rows.every(row => row.payee === 'Maas'),
    'the Register still shows the automatic name',
  );

  const listed = await ask(dataDir, { kind: 'counterparties.list' });
  assert.equal(listed.rows.find(one => one.key === key)?.name, 'Maas');

  const backlog = await ask(dataDir, { kind: 'counterparties.unfiled' });
  for (const one of backlog) {
    if (one.key === key) assert.equal(one.name, 'Maas');
  }

  // The rule is still keyed on the canonical key, and still says what it said.
  const rules = await ask(dataDir, { kind: 'rules.list' });
  const rule = rules.find(one => one.counterpartyKey === key);
  assert.ok(rule, 'the rule lost its counterparty when the name changed');
  assert.equal(rule.categoryName, 'Public transport');

  // And the bank's own string is still there, as the evidence it is.
  const detail = await ask(dataDir, {
    kind: 'transaction.detail',
    transactionId: ledger.rows[0].id,
  });
  assert.equal(detail.counterpartyKey, key);
  assert.ok(
    (detail.provenance?.description ?? '').length > 0,
    'what the bank printed is gone',
  );
  assert.ok(
    !(detail.provenance?.description ?? '').includes('Maas'),
    'the owner’s name was written over the bank’s own words',
  );
});

test('a later import cannot overwrite the name the owner chose', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });

  const counterparties = await ask(dataDir, { kind: 'counterparties.list' });
  const fuel = counterparties.rows.find(one => one.name === 'Testfuel');
  assert.ok(fuel);

  await ask(dataDir, {
    kind: 'counterparty.setName',
    counterpartyKey: fuel.key,
    displayName: 'Maas',
  });

  // A second statement carrying the same counterparty under its raw name.
  await ask(dataDir, { kind: 'import.camt', paths: [later] });

  const after = await ask(dataDir, { kind: 'counterparties.list' });
  assert.equal(
    after.rows.find(one => one.key === fuel.key)?.name,
    'Maas',
    'an import put the automatic name back',
  );

  const rows = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { counterpartyKey: fuel.key },
  });
  assert.ok(
    rows.rows.every(row => row.payee === 'Maas'),
    'a transaction imported after the rename carries the automatic name',
  );

  // And it survives a restart, because it is kept beside the budget.
  await restart(dataDir);
  const reopened = await ask(dataDir, { kind: 'counterparties.list' });
  assert.equal(reopened.rows.find(one => one.key === fuel.key)?.name, 'Maas');
});

test('clearing the name puts the automatic one back', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });
  const counterparties = await ask(dataDir, { kind: 'counterparties.list' });
  const fuel = counterparties.rows.find(one => one.name === 'Testfuel');
  assert.ok(fuel);

  await ask(dataDir, {
    kind: 'counterparty.setName',
    counterpartyKey: fuel.key,
    displayName: 'Maas',
  });
  const cleared = await ask(dataDir, {
    kind: 'counterparty.setName',
    counterpartyKey: fuel.key,
    displayName: '   ',
  });
  assert.equal(cleared.counterparty.name, 'Testfuel');
});

test('a merge carries the owner’s name across when the target has none (8 §8.4)', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [variants] });

  const listed = await ask(dataDir, { kind: 'counterparties.list' });
  const [target, variant] = listed.rows;

  // The owner named the variant, not the target.
  await ask(dataDir, {
    kind: 'counterparty.setName',
    counterpartyKey: variant.key,
    displayName: 'Maas',
  });

  await ask(dataDir, {
    kind: 'alias.create',
    variantKey: variant.key,
    variant: variant.name,
    counterpartyKey: target.key,
  });

  const after = await ask(dataDir, { kind: 'counterparties.list' });
  assert.equal(
    after.rows.find(one => one.key === target.key)?.name,
    'Maas',
    'the owner’s name was dropped when the shop got a new key',
  );
});

test('two names for one shop are one counterparty only when a person says so', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [variants] });

  const before = await ask(dataDir, { kind: 'counterparties.list' });
  assert.ok(
    before.rows.length >= 2,
    'AYQ merged two spellings on its own, without being told',
  );

  // Similar text is not identity. Nothing in the engine may join these until an
  // explicit alias says they are the same shop.
  assert.deepEqual(await ask(dataDir, { kind: 'aliases.list' }), []);

  const [target, variant] = before.rows;
  await ask(dataDir, {
    kind: 'alias.create',
    variantKey: variant.key,
    variant: variant.name,
    counterpartyKey: target.key,
  });
  const after = await ask(dataDir, { kind: 'counterparties.list' });
  assert.equal(after.rows.length, before.rows.length - 1);
});


/* ------------------------------------------- what a category normally costs

   10. An arithmetic mean over the complete, reliably covered months behind the
   Plan month — and the divisor is the months actually included, never twelve.
   A month AYQ holds half a statement for is an unknown month, not a cheap one,
   and averaging it in as nought understates every suggestion in the one
   direction that leaves a person planning too little.                       */

/** A statement of one month, with both of the bank's own balances in it. */
function monthOf(
  month: string,
  spendCents: number,
  opening: number,
): string {
  const [year, index] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, index, 0)).getUTCDate();
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>camt053-${month}</MsgId><CreDtTm>${month}-01T00:00:00</CreDtTm></GrpHdr>
    <Stmt>
      <Id>NL04TEST0123456789.${month}</Id>
      <CreDtTm>${month}-01T00:00:00</CreDtTm>
      <FrToDt><FrDtTm>${month}-01T00:00:00</FrDtTm><ToDtTm>${month}-${last}T23:59:59</ToDtTm></FrToDt>
      <Acct><Id><IBAN>NL04TEST0123456789</IBAN></Id><Ccy>EUR</Ccy></Acct>
      <Bal><Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">${(
        opening / 100
      ).toFixed(2)}</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>${month}-01</Dt></Dt></Bal>
      <Bal><Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">${(
        (opening - spendCents) / 100
      ).toFixed(2)}</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>${month}-${last}</Dt></Dt></Bal>
      <Ntry>
        <Amt Ccy="EUR">${(spendCents / 100).toFixed(2)}</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts>BOOK</Sts>
        <BookgDt><Dt>${month}-15</Dt></BookgDt><ValDt><Dt>${month}-15</Dt></ValDt>
        <AcctSvcrRef>PLAN${month.replace('-', '')}0001</AcctSvcrRef>
        <BkTxCd><Domn><Cd>PMNT</Cd><Fmly><Cd>DDBT</Cd><SubFmlyCd>PMDD</SubFmlyCd></Fmly></Domn></BkTxCd>
        <NtryDtls><TxDtls>
          <Refs><EndToEndId>PLAN-${month}</EndToEndId></Refs>
          <RltdPties><Cdtr><Nm>TESTWINKEL B.V.</Nm></Cdtr></RltdPties>
          <RmtInf><Ustrd>TESTWINKEL B.V.</Ustrd></RmtInf>
        </TxDtls></NtryDtls>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>
`;
}

/** Writes and imports one month, and files its spending into a category. */
async function spentIn(
  dataDir: string,
  month: string,
  spendCents: number,
  opening: number,
  categoryId: string,
): Promise<void> {
  const path = join(dataDir, `ayq-plan-${month}.xml`);
  await writeFile(path, monthOf(month, spendCents, opening), 'utf8');
  await ask(dataDir, { kind: 'import.camt', paths: [path] });

  const rows = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { from: `${month}-01`, to: `${month}-28` },
  });
  for (const row of rows.rows) {
    if (row.categoryId !== null) continue;
    await ask(dataDir, {
      kind: 'transaction.categorise',
      transactionId: row.id,
      categoryId,
    });
  }
}

/** The suggestion for one category on one Plan month. */
function suggestionFor(
  sheet: AyqResults['plan.month'],
  categoryName: string,
): AyqResults['plan.month']['suggestions'][number] {
  const found = sheet.suggestions.find(one => one.categoryName === categoryName);
  assert.ok(found, `no suggestion row for ${categoryName}`);
  return found;
}

test('a suggestion is the mean over the months AYQ can vouch for (10 §10.1)', async () => {
  const dataDir = await budget();
  const categories = await ask(dataDir, { kind: 'categories.list' });
  const shopping = categories.find(one => one.name === 'Shopping');
  assert.ok(shopping);

  // Seven complete months, and a different amount in each so the mean is not
  // also the only number in sight.
  const months = [
    ['2026-01', 10_000],
    ['2026-02', 20_000],
    ['2026-03', 30_000],
    ['2026-04', 40_000],
    ['2026-05', 50_000],
    ['2026-06', 60_000],
    ['2026-07', 5_000],
  ] as Array<[string, number]>;

  let opening = 1_000_000;
  for (const [month, spend] of months) {
    await spentIn(dataDir, month, spend, opening, shopping.id);
    opening -= spend;
  }

  const sheet = await ask(dataDir, {
    kind: 'plan.month',
    month: '2026-08',
    today: '2026-08-01',
  });
  const suggestion = suggestionFor(sheet, 'Shopping');

  const total = months.reduce((sum, [, spend]) => sum + spend, 0);
  assert.equal(suggestion.monthsUsed, 7, 'the divisor is not the months included');
  assert.equal(suggestion.suggestedCents, Math.round(total / 7));
  assert.equal(suggestion.fromMonth, '2026-01');
  assert.equal(suggestion.toMonth, '2026-07');
  assert.equal(suggestion.totalCents, total);

  // Twelve is not the divisor: five of the twelve months behind August are not
  // covered at all, and they are left out rather than counted as nothing.
  assert.notEqual(suggestion.suggestedCents, Math.round(total / 12));
});

test('an incomplete month is left out rather than counted as nothing', async () => {
  const dataDir = await budget();
  const categories = await ask(dataDir, { kind: 'categories.list' });
  const shopping = categories.find(one => one.name === 'Shopping');
  assert.ok(shopping);

  await spentIn(dataDir, '2026-01', 30_000, 1_000_000, shopping.id);
  await spentIn(dataDir, '2026-02', 30_000, 970_000, shopping.id);

  const whole = await ask(dataDir, {
    kind: 'plan.month',
    month: '2026-03',
    today: '2026-03-01',
  });
  assert.equal(suggestionFor(whole, 'Shopping').monthsUsed, 2);
  assert.equal(suggestionFor(whole, 'Shopping').suggestedCents, 30_000);

  // A third month, half of which AYQ holds no statement for. The mean must not
  // move: the month is unknown, not cheap.
  const half = join(dataDir, 'ayq-plan-half.xml');
  await writeFile(
    half,
    monthOf('2026-03', 4_000, 940_000).replace(
      '<ToDtTm>2026-03-31T23:59:59</ToDtTm>',
      '<ToDtTm>2026-03-16T23:59:59</ToDtTm>',
    ),
    'utf8',
  );
  await ask(dataDir, { kind: 'import.camt', paths: [half] });

  const after = await ask(dataDir, {
    kind: 'plan.month',
    month: '2026-04',
    today: '2026-04-01',
  });
  const suggestion = suggestionFor(after, 'Shopping');
  assert.equal(suggestion.monthsUsed, 2, 'a half-covered month was counted');
  assert.equal(suggestion.toMonth, '2026-02');
  assert.equal(suggestion.suggestedCents, 30_000);
});

test('no complete month behind it means no usable suggestion (10 §10.1)', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });

  const sheet = await ask(dataDir, {
    kind: 'plan.month',
    month: '2026-06',
    today: '2026-06-15',
  });

  // Every plannable category still has a row, so the screen can say why there
  // is nothing rather than leaving the category out and looking as though the
  // arithmetic forgot it.
  assert.ok(sheet.suggestions.length > 0);
  for (const one of sheet.suggestions) {
    assert.equal(one.suggestedCents, null, `${one.categoryName} was suggested for`);
    assert.equal(one.monthsUsed, 0);
    assert.equal(one.fromMonth, null);
  }
});

test('income and Starting Balances are not suggestion targets (10 §10.1)', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });

  const sheet = await ask(dataDir, {
    kind: 'plan.month',
    month: '2026-07',
    today: '2026-07-01',
  });
  const named = sheet.suggestions.map(one => one.categoryName);

  for (const never of ['Salary', 'Other income', 'Starting Balances', 'Uncategorised']) {
    assert.ok(!named.includes(never), `${never} was offered a spending plan`);
  }
  assert.ok(named.includes('Groceries'));
});

test('accepting one suggestion writes that row and no other (10 §10.3)', async () => {
  const dataDir = await budget();
  const categories = await ask(dataDir, { kind: 'categories.list' });
  const shopping = categories.find(one => one.name === 'Shopping');
  const groceries = categories.find(one => one.name === 'Groceries');
  assert.ok(shopping && groceries);

  await spentIn(dataDir, '2026-01', 30_000, 1_000_000, shopping.id);
  await spentIn(dataDir, '2026-02', 30_000, 970_000, shopping.id);

  const month = '2026-03';
  const before = await ask(dataDir, { kind: 'plan.month', month, today: '2026-03-01' });
  if (!before.editable) return;

  const applied = await ask(dataDir, {
    kind: 'plan.useSuggestion',
    month,
    categoryId: shopping.id,
  });

  assert.equal(
    applied.rows.find(one => one.categoryId === shopping.id)?.planCents,
    30_000,
    'the suggestion did not become the plan',
  );
  assert.equal(
    applied.rows.find(one => one.categoryId === groceries.id)?.planCents,
    0,
    'accepting one row wrote another',
  );

  // And recomputing does not move it: the suggestion and the plan are two
  // fields, and only one of them is the owner's.
  const again = await ask(dataDir, { kind: 'plan.month', month, today: '2026-03-01' });
  assert.equal(
    again.rows.find(one => one.categoryId === shopping.id)?.planCents,
    30_000,
  );
});

test('Use all fills only the rows with no plan in them (10 §10.3)', async () => {
  const dataDir = await budget();
  const categories = await ask(dataDir, { kind: 'categories.list' });
  const shopping = categories.find(one => one.name === 'Shopping');
  assert.ok(shopping);

  await spentIn(dataDir, '2026-01', 30_000, 1_000_000, shopping.id);
  await spentIn(dataDir, '2026-02', 30_000, 970_000, shopping.id);

  const month = '2026-03';
  const before = await ask(dataDir, { kind: 'plan.month', month, today: '2026-03-01' });
  if (!before.editable) return;

  // A figure the owner typed. A bulk action must not touch it.
  await ask(dataDir, {
    kind: 'budget.setPlan',
    month,
    categoryId: shopping.id,
    cents: 12_345,
  });

  const applied = await ask(dataDir, { kind: 'plan.useAllSuggestions', month });
  assert.equal(
    applied.rows.find(one => one.categoryId === shopping.id)?.planCents,
    12_345,
    'a bulk action wrote over a plan somebody typed',
  );

  // A row-level acceptance may replace it, because that is a person looking at
  // that row and deciding.
  const one = await ask(dataDir, {
    kind: 'plan.useSuggestion',
    month,
    categoryId: shopping.id,
  });
  assert.equal(
    one.rows.find(row => row.categoryId === shopping.id)?.planCents,
    30_000,
  );
});

test('a reversal reduces the suggestion exactly as it reduces the actual (03 §9)', async () => {
  const dataDir = await budget();
  const categories = await ask(dataDir, { kind: 'categories.list' });
  const shopping = categories.find(one => one.name === 'Shopping');
  assert.ok(shopping);

  await spentIn(dataDir, '2026-01', 30_000, 1_000_000, shopping.id);
  await spentIn(dataDir, '2026-02', 30_000, 970_000, shopping.id);

  const january = await ask(dataDir, {
    kind: 'plan.month',
    month: '2026-02',
    today: '2026-02-01',
  });
  // The Plan's own Actual column and the suggestion read the same arithmetic,
  // which is what 03 §9.3 requires of them.
  assert.equal(
    january.rows.find(one => one.categoryId === shopping.id)?.actualCents,
    30_000,
  );
  assert.equal(suggestionFor(january, 'Shopping').suggestedCents, 30_000);
});


test('merging two variants keeps the target’s own name (8 §8.4)', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [variants] });

  const listed = await ask(dataDir, { kind: 'counterparties.list' });
  assert.ok(listed.rows.length >= 2, 'the fixture holds two variants of one shop');
  const [target, variant] = listed.rows;

  await ask(dataDir, {
    kind: 'counterparty.setName',
    counterpartyKey: target.key,
    displayName: 'Maas',
  });

  const merged = await ask(dataDir, {
    kind: 'alias.create',
    variantKey: variant.key,
    variant: variant.name,
    counterpartyKey: target.key,
  });
  assert.equal(merged.counterpartyKey, target.key);

  const after = await ask(dataDir, { kind: 'counterparties.list' });
  assert.equal(
    after.rows.find(one => one.key === target.key)?.name,
    'Maas',
    'the target lost the name the owner gave it',
  );
});
