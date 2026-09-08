import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { ayqAuditCoverage } from '../src/ayq-coverage.ts';
import { ayqLoadTargets, ayqReadCamtZip } from '../src/ayq-files.ts';
import { ayqMeasure } from '../src/ayq-measure.ts';
import { ayqParseCamt } from '../src/ayq-camt053.ts';
import { ayqReadZip } from '../src/ayq-zip.ts';
import { ayqEvaluateSpike, type AyqExpectations } from '../src/ayq-verify.ts';
import { padLikeAbn, readFixture } from './ayq-fixtures.ts';
import { buildZip } from './ayq-zip-writer.ts';

const day = await readFixture('ayq-abn-day.xml');

test('the walk descends into subdirectories and skips non-XML', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ayq-'));
  await mkdir(join(root, '2026', '05'), { recursive: true });
  await writeFile(join(root, '2026', '05', 'b.xml'), day);
  await writeFile(join(root, '2026', 'a.XML'), day);
  await writeFile(join(root, 'readme.txt'), 'not XML');

  const files = await ayqLoadTargets([root]);
  assert.equal(files.length, 2);
  assert.deepEqual(
    files.map(file => file.name).sort(),
    ['a.XML', 'b.xml'],
  );
});

test('the encoding is read from the XML declaration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ayq-'));

  const utf8 = join(root, 'utf8.xml');
  await writeFile(utf8, padLikeAbn(day));
  const [readUtf8] = await ayqLoadTargets([utf8]);
  assert.equal(readUtf8.declaredEncoding, 'UTF-8');
  assert.equal(readUtf8.bytes, 32_500);

  // The same document, declared and written as ISO-8859-1, with a diacritic
  // in the name.
  const latinSource = day
    .replace('encoding="UTF-8"', 'encoding="ISO-8859-1"')
    .replace('ALBERT HEIJN 1234', 'CAFÉ ZÜRICH');
  const latin = join(root, 'latin.xml');
  await writeFile(latin, Buffer.from(latinSource, 'latin1'));

  const [readLatin] = await ayqLoadTargets([latin]);
  assert.equal(readLatin.declaredEncoding, 'ISO-8859-1');
  assert.ok(
    readLatin.content.includes('CAFÉ ZÜRICH'),
    'the diacritics survive instead of turning into replacement characters',
  );

  const entries = await ayqParseCamt(readLatin.content);
  assert.ok(entries[0].additionalEntryInformation?.includes('CAFÉ ZÜRICH'));
});

test('a ZIP is read directly, both deflated and stored', async () => {
  const archive = buildZip([
    { name: '20260531.xml', content: padLikeAbn(day) },
    { name: 'map/20260601.xml', content: padLikeAbn(day), stored: true },
    { name: 'map/', content: '' },
    { name: 'readme.txt', content: 'not XML' },
  ]);

  const raw = ayqReadZip(archive);
  assert.equal(raw.length, 3, 'directories are skipped, files are not');

  const root = await mkdtemp(join(tmpdir(), 'ayq-'));
  const path = join(root, 'export.zip');
  await writeFile(path, archive);

  const files = await ayqReadCamtZip(path);
  assert.equal(files.length, 2, 'only the XML files are taken');
  assert.deepEqual(
    files.map(file => file.name),
    ['20260531.xml', '20260601.xml'],
  );
  assert.equal(files[0].archive, 'export.zip');
  assert.equal(files[0].bytes, 32_500);

  // Content from the archive yields the same records as content from disk.
  const fromZip = await ayqParseCamt(files[0].content);
  const fromDisk = await ayqParseCamt(day);
  assert.deepEqual(fromZip, fromDisk);
});

test('a ZIP is accepted through ayqLoadTargets too, including from a directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ayq-'));
  await writeFile(
    join(root, 'export.zip'),
    buildZip([{ name: '20260531.xml', content: day }]),
  );
  await writeFile(join(root, 'los.xml'), day);

  const files = await ayqLoadTargets([root]);
  assert.equal(files.length, 2);
  assert.equal(files.filter(file => file.archive !== null).length, 1);
});

test('a corrupt or unsupported ZIP is reported, not half-read', () => {
  assert.throws(
    () => ayqReadZip(Buffer.from('this is not an archive')),
    /not a ZIP archive/,
  );

  const encrypted = buildZip([{ name: 'a.xml', content: day }]);
  // Raise the encryption flag in the central directory.
  const directoryOffset = encrypted.readUInt32LE(encrypted.length - 6);
  encrypted.writeUInt16LE(0x1, directoryOffset + 8);
  assert.throws(() => ayqReadZip(encrypted), /encrypted/);
});

const expectations: AyqExpectations = {
  files: 1,
  entries: 9,
  withTxDtls: 5,
  withoutTxDtls: 4,
};

test('the criteria pass against the expected numbers', async () => {
  const entries = await ayqParseCamt(day, { file: 'ayq-abn-day.xml' });
  const verdict = ayqEvaluateSpike(
    ayqMeasure(entries, 1),
    await ayqAuditCoverage([day]),
    0,
    expectations,
  );
  assert.equal(verdict.passed, true);
  assert.ok(verdict.checks.every(check => check.passed));
});

test('a mismatch in the counts fails the spike', async () => {
  const entries = await ayqParseCamt(day, { file: 'ayq-abn-day.xml' });
  const verdict = ayqEvaluateSpike(
    ayqMeasure(entries, 1),
    await ayqAuditCoverage([day]),
    0,
    { ...expectations, entries: 567 },
  );
  assert.equal(verdict.passed, false);
  assert.equal(
    verdict.checks.find(check => !check.passed)?.name,
    '<Ntry> entries',
  );
});

test('a file that failed to parse fails the spike', async () => {
  const entries = await ayqParseCamt(day, { file: 'ayq-abn-day.xml' });
  const verdict = ayqEvaluateSpike(
    ayqMeasure(entries, 1),
    await ayqAuditCoverage([day]),
    1,
    expectations,
  );
  assert.equal(verdict.passed, false);
});

test('an uncovered XML path does not fail, it calls for a decision', async () => {
  const withNewField = day.replace(
    '<AcctSvcrRef>2026053100000001</AcctSvcrRef>',
    '<AcctSvcrRef>2026053100000001</AcctSvcrRef><TechInptChanl><Cd>POSD</Cd></TechInptChanl>',
  );
  const entries = await ayqParseCamt(withNewField, { file: 'x.xml' });
  const verdict = ayqEvaluateSpike(
    ayqMeasure(entries, 1),
    await ayqAuditCoverage([withNewField]),
    0,
    expectations,
  );
  assert.equal(verdict.passed, true);

  const advisory = verdict.checks.find(
    check => check.name === 'uncovered XML paths',
  );
  assert.equal(advisory?.advisory, true);
  assert.equal(advisory?.passed, false);
  assert.equal(advisory?.actual, '1');
});

test('the 350/217 counts are about <Ntry>, not intermediate records', async () => {
  // One <Ntry> with two <TxDtls> plus one with a single one: two entries
  // with TxDtls, but three intermediate records. The criterion is about
  // <Ntry> and must see 2.
  const batchAndFx = await readFixture('ayq-batch-and-fx.xml');
  const entries = await ayqParseCamt(batchAndFx, { file: 'batch.xml' });
  const measurement = ayqMeasure(entries, 1);

  assert.equal(measurement.entries, 2);
  assert.equal(measurement.records, 3);
  assert.equal(measurement.withTxDtls, 2, 'counts <Ntry>, not records');
  assert.equal(measurement.recordsWithTxDtls, 3, 'records are counted separately');
  assert.equal(measurement.withoutTxDtls, 0);
  assert.equal(measurement.batched, 1);
});

test('a batch does not fail the spike, but is reported', async () => {
  const batchAndFx = await readFixture('ayq-batch-and-fx.xml');
  const entries = await ayqParseCamt(batchAndFx, { file: 'batch.xml' });
  const verdict = ayqEvaluateSpike(
    ayqMeasure(entries, 1),
    await ayqAuditCoverage([batchAndFx]),
    0,
    { files: 1, entries: 2, withTxDtls: 2, withoutTxDtls: 0 },
  );
  assert.equal(verdict.passed, true);

  const advisory = verdict.checks.find(
    check => check.name === '<Ntry> with more than one <TxDtls>',
  );
  assert.equal(advisory?.advisory, true);
  assert.equal(advisory?.actual, '1');
});
