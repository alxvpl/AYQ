// Settings → Data & Backup (04 A38).
//
// What the screen must do is small and each part is a test: say when the last
// backup was made and whether the last attempt failed, show whether automatic
// backups are running, make a backup on request, and restore a chosen backup —
// only after the person has confirmed it, only as one whole backup, and with
// the engine's reason in the catalogue's words when it will not.
//
// Every backup, date and figure below is invented.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type {
  AyqBackupEntry,
  AyqBackupOverview,
} from '../src/ayq-ipc-contract.ts';
import { AyqSettingsBackup } from '../src/ayq-screens/ayq-settings-backup.tsx';
import { AYQ_SETTINGS_TABS } from '../src/ayq-screens/ayq-settings.tsx';
import { ayqMoment, ayqText } from '../src/ayq-strings.ts';
import { AyqGroundProvider } from '../src/ayq-ui/ayq-ground-provider.tsx';

import { ayqOpenWindow, ayqPress } from './ayq-react.ts';

const NEWEST: AyqBackupEntry = {
  backupId: '20260923T080000000Z-aaaaaa',
  createdAt: '2026-09-23T08:00:00.000Z',
  trigger: 'automatic',
  productVersion: '0.4.0',
  buildNumber: '010',
  bytes: 3_250_000,
  restorable: true,
};
const OLDER: AyqBackupEntry = {
  backupId: '20260920T180000000Z-bbbbbb',
  createdAt: '2026-09-20T18:00:00.000Z',
  trigger: 'manual',
  productVersion: '0.4.0',
  buildNumber: '009',
  bytes: 3_100_000,
  restorable: true,
};
const FUTURE: AyqBackupEntry = {
  backupId: '20260919T180000000Z-cccccc',
  createdAt: '2026-09-19T18:00:00.000Z',
  trigger: 'manual',
  productVersion: '0.9.0',
  buildNumber: '090',
  bytes: 3_000_000,
  restorable: false,
};

function overview(over: Partial<AyqBackupOverview> = {}): AyqBackupOverview {
  return {
    backups: [NEWEST, OLDER],
    latestBackupId: NEWEST.backupId,
    lastAttempt: {
      at: NEWEST.createdAt,
      trigger: 'automatic',
      outcome: 'succeeded',
      backupId: NEWEST.backupId,
      failure: null,
    },
    lastAutomaticAttempt: {
      at: NEWEST.createdAt,
      trigger: 'automatic',
      outcome: 'succeeded',
      backupId: NEWEST.backupId,
      failure: null,
    },
    automatic: { everyHours: 24, kept: 10 },
    ...over,
  };
}

function engine(answers: Record<string, unknown> = {}) {
  return (request: Record<string, unknown>): unknown => {
    if (request.kind === 'settings.get') return { ground: 'light' };
    if (request.kind in answers) return answers[request.kind as string];
    if (request.kind === 'backup.overview') return overview();
    return undefined;
  };
}

function screen(changed: () => void = () => undefined) {
  return (
    <AyqGroundProvider>
      <AyqSettingsBackup
        onFailure={message => {
          throw new Error(message);
        }}
        onChanged={changed}
      />
    </AyqGroundProvider>
  );
}

function text(window: { container: HTMLElement }): string {
  return window.container.textContent ?? '';
}

test('Data & Backup is a Settings tab, named from the catalogue', () => {
  const tab = AYQ_SETTINGS_TABS.find(one => one.id === 'backup');
  assert.ok(tab, 'Settings has no Data & Backup tab');
  assert.equal(ayqText(tab.key), 'Data & Backup');
});

test('the history is newest first, with the latest marked and every kind named', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());

  const rows = [
    ...window.container.querySelectorAll('[data-ayq-table="backups"] tbody tr'),
  ];
  assert.deepEqual(
    rows.map(one => one.getAttribute('data-ayq-row')),
    [NEWEST.backupId, OLDER.backupId],
  );
  assert.match(
    rows[0].textContent ?? '',
    new RegExp(ayqText('backup.latestMark')),
  );
  assert.doesNotMatch(
    rows[1].textContent ?? '',
    new RegExp(ayqText('backup.latestMark')),
  );
  assert.match(
    rows[0].textContent ?? '',
    new RegExp(ayqText('backup.kind.automatic')),
  );
  assert.match(
    rows[1].textContent ?? '',
    new RegExp(ayqText('backup.kind.manual')),
  );
  assert.match(rows[1].textContent ?? '', /build 009/);
  assert.match(rows[0].textContent ?? '', /3\.1 MB/);

  // When the last backup was made is the first thing said.
  assert.ok(
    text(window).includes(
      ayqText('backup.latest', { when: ayqMoment(NEWEST.createdAt) }),
    ),
  );
  // And the automatic backups are running.
  const automatic = window.container.querySelector(
    '[data-ayq-setting-row="backup-automatic"]',
  );
  assert.equal(
    automatic
      ?.querySelector('[data-ayq-state]')
      ?.getAttribute('data-ayq-state'),
    'operational',
  );
  await window.close();
});

test('a failed automatic backup is shown as needing attention, with its reason', async () => {
  const failed = {
    at: '2026-09-23T07:00:00.000Z',
    trigger: 'automatic' as const,
    outcome: 'failed' as const,
    backupId: null,
    failure: 'write-failed' as const,
  };
  const window = await ayqOpenWindow(
    engine({
      'backup.overview': overview({
        lastAttempt: failed,
        lastAutomaticAttempt: failed,
      }),
    }),
  );
  await window.render(screen());

  const automatic = window.container.querySelector(
    '[data-ayq-setting-row="backup-automatic"]',
  );
  assert.equal(
    automatic
      ?.querySelector('[data-ayq-state]')
      ?.getAttribute('data-ayq-state'),
    'overdue',
  );
  assert.ok(
    (automatic?.textContent ?? '').includes(
      ayqText('backup.failure.write-failed'),
    ),
    'the reason it failed is not stated',
  );
  await window.close();
});

test('Create backup now asks the engine, and says what came of it', async () => {
  const made = overview({
    backups: [
      {
        ...NEWEST,
        backupId: '20260923T090000000Z-dddddd',
        trigger: 'manual',
        createdAt: '2026-09-23T09:00:00.000Z',
      },
      NEWEST,
      OLDER,
    ],
    latestBackupId: '20260923T090000000Z-dddddd',
  });
  const window = await ayqOpenWindow(
    engine({
      'backup.create': {
        outcome: 'created',
        backupId: '20260923T090000000Z-dddddd',
        overview: made,
      },
    }),
  );
  await window.render(screen());
  await ayqPress(
    window.container.querySelector('[data-ayq-action="backup-now"]'),
  );

  const sent = window.asked.filter(one => one.kind === 'backup.create');
  assert.equal(sent.length, 1);
  // Nothing but the kind and the correlation id: the renderer names no file.
  assert.deepEqual(Object.keys(sent[0]).sort(), ['id', 'kind']);
  assert.equal(
    window.container.querySelector('[data-ayq-backup-said]')?.textContent,
    ayqText('backup.created'),
  );
  assert.equal(
    window.container.querySelectorAll('[data-ayq-table="backups"] tbody tr')
      .length,
    3,
  );
  await window.close();
});

test('a backup that could not be made says why', async () => {
  const window = await ayqOpenWindow(
    engine({
      'backup.create': {
        outcome: 'failed',
        failure: 'write-failed',
        overview: overview(),
      },
    }),
  );
  await window.render(screen());
  await ayqPress(
    window.container.querySelector('[data-ayq-action="backup-now"]'),
  );
  const said = window.container.querySelector('[data-ayq-backup-said]');
  assert.equal(said?.getAttribute('data-ayq-backup-said'), 'failed');
  assert.equal(
    said?.textContent,
    ayqText('backup.failed', { why: ayqText('backup.failure.write-failed') }),
  );
  await window.close();
});

test('restoring asks first, and cancelling asks the engine nothing', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());

  const buttons = window.container.querySelectorAll(
    '[data-ayq-action="backup-restore"]',
  );
  await ayqPress(buttons[1]);
  const confirm = window.container.querySelector('[data-ayq-backup-confirm]');
  assert.equal(
    confirm?.getAttribute('data-ayq-backup-confirm'),
    OLDER.backupId,
  );
  assert.ok(
    (confirm?.textContent ?? '').includes(
      ayqText('backup.restore.confirm', { when: ayqMoment(OLDER.createdAt) }),
    ),
  );
  assert.equal(
    window.asked.filter(one => one.kind === 'backup.restore').length,
    0,
  );

  await ayqPress(
    window.container.querySelector('[data-ayq-action="backup-restore-cancel"]'),
  );
  assert.equal(
    window.container.querySelector('[data-ayq-backup-confirm]'),
    null,
  );
  assert.equal(
    window.asked.filter(one => one.kind === 'backup.restore').length,
    0,
  );
  await window.close();
});

test('a confirmed restore names one whole backup, and the window reloads after it', async () => {
  let changed = 0;
  const window = await ayqOpenWindow(
    engine({
      'backup.restore': {
        outcome: 'restored',
        backupId: OLDER.backupId,
        keptBackupId: '20260923T100000000Z-eeeeee',
        overview: overview(),
      },
    }),
  );
  await window.render(screen(() => (changed += 1)));
  await ayqPress(
    window.container.querySelectorAll('[data-ayq-action="backup-restore"]')[1],
  );
  await ayqPress(
    window.container.querySelector('[data-ayq-action="backup-restore-go"]'),
  );

  const sent = window.asked.filter(one => one.kind === 'backup.restore');
  assert.equal(sent.length, 1);
  // One backup, by its id, and nothing that could name a budget or a store alone.
  assert.deepEqual(Object.keys(sent[0]).sort(), ['backupId', 'id', 'kind']);
  assert.equal(sent[0].backupId, OLDER.backupId);
  assert.equal(changed, 1, 'the shell was not told everything changed');
  assert.equal(
    window.container.querySelector('[data-ayq-backup-said]')?.textContent,
    ayqText('backup.restored', { when: ayqMoment(OLDER.createdAt) }),
  );
  await window.close();
});

test("a refused restore says why in the catalogue's words, and changes nothing", async () => {
  let changed = 0;
  const window = await ayqOpenWindow(
    engine({
      'backup.restore': {
        outcome: 'refused',
        refusal: 'mismatch',
        overview: overview(),
      },
    }),
  );
  await window.render(screen(() => (changed += 1)));
  await ayqPress(
    window.container.querySelectorAll('[data-ayq-action="backup-restore"]')[0],
  );
  await ayqPress(
    window.container.querySelector('[data-ayq-action="backup-restore-go"]'),
  );

  const said = window.container.querySelector('[data-ayq-backup-said]');
  assert.equal(said?.getAttribute('data-ayq-backup-said'), 'refused');
  assert.equal(
    said?.textContent,
    ayqText('backup.refused', { why: ayqText('backup.refusal.mismatch') }),
  );
  assert.equal(changed, 0);
  await window.close();
});

test('a backup this AYQ cannot restore offers no restore', async () => {
  const window = await ayqOpenWindow(
    engine({ 'backup.overview': overview({ backups: [NEWEST, FUTURE] }) }),
  );
  await window.render(screen());
  const row = window.container.querySelector(
    `[data-ayq-row="${FUTURE.backupId}"]`,
  );
  assert.equal(row?.querySelector('[data-ayq-action="backup-restore"]'), null);
  assert.ok((row?.textContent ?? '').includes(ayqText('backup.notRestorable')));
  await window.close();
});

test('with no backups the screen says so, and how one will come to exist', async () => {
  const window = await ayqOpenWindow(
    engine({
      'backup.overview': overview({
        backups: [],
        latestBackupId: null,
        lastAttempt: null,
        lastAutomaticAttempt: null,
      }),
    }),
  );
  await window.render(screen());
  assert.ok(text(window).includes(ayqText('backup.latest.none')));
  assert.ok(text(window).includes(ayqText('backup.empty')));
  assert.ok(text(window).includes(ayqText('backup.automatic.never')));
  await window.close();
});
