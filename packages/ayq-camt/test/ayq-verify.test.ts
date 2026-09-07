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

test('обхождането слиза в подпапки и пропуска не-XML', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ayq-'));
  await mkdir(join(root, '2026', '05'), { recursive: true });
  await writeFile(join(root, '2026', '05', 'b.xml'), day);
  await writeFile(join(root, '2026', 'a.XML'), day);
  await writeFile(join(root, 'readme.txt'), 'не е XML');

  const files = await ayqLoadTargets([root]);
  assert.equal(files.length, 2);
  assert.deepEqual(
    files.map(file => file.name).sort(),
    ['a.XML', 'b.xml'],
  );
});

test('кодировката се чете от XML декларацията', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ayq-'));

  const utf8 = join(root, 'utf8.xml');
  await writeFile(utf8, padLikeAbn(day));
  const [readUtf8] = await ayqLoadTargets([utf8]);
  assert.equal(readUtf8.declaredEncoding, 'UTF-8');
  assert.equal(readUtf8.bytes, 32_500);

  // Същият документ, обявен и записан като ISO-8859-1, с диакритика в името.
  const latinSource = day
    .replace('encoding="UTF-8"', 'encoding="ISO-8859-1"')
    .replace('ALBERT HEIJN 1234', 'CAFÉ ZÜRICH');
  const latin = join(root, 'latin.xml');
  await writeFile(latin, Buffer.from(latinSource, 'latin1'));

  const [readLatin] = await ayqLoadTargets([latin]);
  assert.equal(readLatin.declaredEncoding, 'ISO-8859-1');
  assert.ok(
    readLatin.content.includes('CAFÉ ZÜRICH'),
    'диакритиката оцелява, вместо да се превърне в заместващи знаци',
  );

  const entries = await ayqParseCamt(readLatin.content);
  assert.ok(entries[0].additionalEntryInformation?.includes('CAFÉ ZÜRICH'));
});

test('ZIP се чете направо, и при deflate, и при store', async () => {
  const archive = buildZip([
    { name: '20260531.xml', content: padLikeAbn(day) },
    { name: 'map/20260601.xml', content: padLikeAbn(day), stored: true },
    { name: 'map/', content: '' },
    { name: 'readme.txt', content: 'не е XML' },
  ]);

  const raw = ayqReadZip(archive);
  assert.equal(raw.length, 3, 'папките се пропускат, файловете — не');

  const root = await mkdtemp(join(tmpdir(), 'ayq-'));
  const path = join(root, 'export.zip');
  await writeFile(path, archive);

  const files = await ayqReadCamtZip(path);
  assert.equal(files.length, 2, 'само XML файловете влизат');
  assert.deepEqual(
    files.map(file => file.name),
    ['20260531.xml', '20260601.xml'],
  );
  assert.equal(files[0].archive, 'export.zip');
  assert.equal(files[0].bytes, 32_500);

  // Съдържанието от архива дава същите записи, както от диска.
  const fromZip = await ayqParseCamt(files[0].content);
  const fromDisk = await ayqParseCamt(day);
  assert.deepEqual(fromZip, fromDisk);
});

test('ZIP се приема и през ayqLoadTargets, включително от папка', async () => {
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

test('повреден или неподдържан ZIP се съобщава, а не се чете наполовина', () => {
  assert.throws(
    () => ayqReadZip(Buffer.from('това не е архив')),
    /не е ZIP архив/,
  );

  const encrypted = buildZip([{ name: 'a.xml', content: day }]);
  // Вдига се флагът за шифроване в централната директория.
  const directoryOffset = encrypted.readUInt32LE(encrypted.length - 6);
  encrypted.writeUInt16LE(0x1, directoryOffset + 8);
  assert.throws(() => ayqReadZip(encrypted), /шифрован/);
});

const expectations: AyqExpectations = {
  files: 1,
  entries: 9,
  withTxDtls: 5,
  withoutTxDtls: 4,
};

test('критериите минават срещу очаквани числа', async () => {
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

test('разминаване в броенията проваля спайка', async () => {
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
    'записи <Ntry>',
  );
});

test('файл с грешка проваля спайка', async () => {
  const entries = await ayqParseCamt(day, { file: 'ayq-abn-day.xml' });
  const verdict = ayqEvaluateSpike(
    ayqMeasure(entries, 1),
    await ayqAuditCoverage([day]),
    1,
    expectations,
  );
  assert.equal(verdict.passed, false);
});

test('непокрит XML път не проваля, а иска решение', async () => {
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
    check => check.name === 'непрочетени XML пътища',
  );
  assert.equal(advisory?.advisory, true);
  assert.equal(advisory?.passed, false);
  assert.equal(advisory?.actual, '1');
});
