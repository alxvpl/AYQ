import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ayqAuditCoverage } from '../src/ayq-coverage.ts';
import { readFixture } from './ayq-fixtures.ts';

const day = await readFixture('ayq-abn-day.xml');
const batchAndFx = await readFixture('ayq-batch-and-fx.xml');

test('nothing in the XML is left unread', async () => {
  const report = await ayqAuditCoverage([day, batchAndFx]);
  assert.equal(report.entries, 11);
  assert.deepEqual(
    report.uncovered,
    {},
    `uncovered paths: ${Object.keys(report.uncovered).join(', ')}`,
  );
});

test('the audit reports a new field instead of passing it by', async () => {
  // The bank adds an element the record does not know about.
  const withNewField = day.replace(
    '<AcctSvcrRef>2026053100000001</AcctSvcrRef>',
    '<AcctSvcrRef>2026053100000001</AcctSvcrRef><TechInptChanl><Cd>POSD</Cd></TechInptChanl>',
  );
  const report = await ayqAuditCoverage([withNewField]);
  assert.deepEqual(report.uncovered, { 'TechInptChanl/Cd': 1 });
});

test('the audit also counts what is read', async () => {
  const report = await ayqAuditCoverage([day]);
  assert.equal(report.covered['BkTxCd/Domn/Fmly/SubFmlyCd'], 9);
  assert.equal(report.covered['NtryDtls/TxDtls/Refs/MndtId'], 2);
  assert.equal(report.covered['__stmt__/Acct/Id/IBAN'], 1);
});
