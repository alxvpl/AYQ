// Needs attention on Today, and the rail's count (010 §6; 013 §4, §5).
//
// The engine decides which groups hold; these tests hand the screen groups and
// check what it draws and where each one leads. Every word is the catalogue's
// (04 A24), every route is the one the condition belongs to, and the rail
// counts groups, not the records inside them.
//
// Every account, file and count below is invented.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AyqApplication } from '../src/ayq-application.tsx';
import type { AyqAttention } from '../src/ayq-ipc-contract.ts';
import { AyqAttentionPane } from '../src/ayq-screens/ayq-attention.tsx';
import { ayqMoment, ayqText } from '../src/ayq-strings.ts';
import { AyqGroundProvider } from '../src/ayq-ui/ayq-ground-provider.tsx';

import { ayqOpenWindow, ayqPress } from './ayq-react.ts';

const ALL: AyqAttention = {
  groups: [
    { key: 'due-today', kind: 'due-today', count: 2 },
    { key: 'overdue', kind: 'overdue', count: 1 },
    {
      key: 'reconciliation-difference:acc-1',
      kind: 'reconciliation-difference',
      count: 1,
      accounts: [{ accountId: 'acc-1', accountName: 'Invented current' }],
    },
    {
      key: 'balance-unknown:acc-2',
      kind: 'balance-unknown',
      count: 1,
      accounts: [{ accountId: 'acc-2', accountName: 'Invented savings' }],
    },
    {
      key: 'import-failed:imp-1/list.xml',
      kind: 'import-failed',
      count: 1,
      files: [
        {
          importId: 'imp-1',
          at: '2026-09-01T09:00:00Z',
          name: 'list.xml',
          code: 'not-camt',
        },
      ],
    },
    {
      key: 'backup-failed:2026-09-23T07:00:00.000Z',
      kind: 'backup-failed',
      count: 1,
      backup: { at: '2026-09-23T07:00:00.000Z', failure: 'write-failed' },
    },
    { key: 'review', kind: 'review', count: 14 },
  ],
};

type Routed = Array<[string, string?]>;

async function pane(attention: AyqAttention) {
  const routed: Routed = [];
  const window = await ayqOpenWindow(() => undefined);
  await window.render(
    <AyqGroundProvider>
      <AyqAttentionPane
        attention={attention}
        routes={{
          open: destination => routed.push(['open', destination]),
          openAccount: accountId => routed.push(['account', accountId]),
          openBackup: () => routed.push(['backup']),
        }}
      />
    </AyqGroundProvider>,
  );
  return { window, routed };
}

test("each group is drawn once, in the engine's order, in the catalogue's words", async () => {
  const { window } = await pane(ALL);
  const rows = [...window.container.querySelectorAll('[data-ayq-attention]')];
  assert.deepEqual(
    rows.map(one => one.getAttribute('data-ayq-attention')),
    ALL.groups.map(one => one.kind),
  );
  const text = (kind: string) =>
    window.container.querySelector(`[data-ayq-attention="${kind}"]`)
      ?.textContent ?? '';
  assert.ok(text('due-today').includes(ayqText('attention.due-today')));
  assert.ok(text('review').includes('14'));
  assert.ok(text('balance-unknown').includes('Invented savings'));
  assert.ok(text('import-failed').includes('list.xml'));
  assert.ok(
    text('backup-failed').includes(
      ayqText('attention.backup-failed.note', {
        when: ayqMoment('2026-09-23T07:00:00.000Z'),
        why: ayqText('backup.failure.write-failed'),
      }),
    ),
  );
  // No identifier of the engine's is shown as it stands.
  const all = window.container.textContent ?? '';
  for (const raw of [
    'write-failed',
    'not-camt',
    'balance-unknown',
    'reconciliation-difference',
  ]) {
    assert.ok(!all.includes(raw), `the pane shows ${raw}`);
  }
  await window.close();
});

test('each group leads to the one place its condition is dealt with', async () => {
  const { window, routed } = await pane(ALL);
  const press = (mark: string) =>
    ayqPress(window.container.querySelector(`[data-ayq-action="${mark}"]`));
  await press('attention-due-today');
  await press('attention-overdue');
  await press('attention-reconciliation-difference-acc-1');
  // 013 §4: the unknown balance goes to the account, where Set account balance is.
  await press('attention-balance-unknown-acc-2');
  await press('attention-import-failed');
  await press('attention-backup-failed');
  await press('attention-review');
  assert.deepEqual(routed, [
    ['open', 'upcoming'],
    ['open', 'upcoming'],
    ['account', 'acc-1'],
    ['account', 'acc-2'],
    ['open', 'import'],
    ['backup'],
    ['open', 'review'],
  ]);
  await window.close();
});

test('nothing holding says so', async () => {
  const { window } = await pane({ groups: [] });
  assert.ok(
    (window.container.textContent ?? '').includes(ayqText('attention.none')),
  );
  assert.equal(
    window.container.querySelectorAll('[data-ayq-attention]').length,
    0,
  );
  await window.close();
});

test('the rail counts groups on Today, not the records inside them (013 §5)', async () => {
  const window = await ayqOpenWindow(request => {
    if (request.kind === 'settings.get') return { ground: 'light' };
    if (request.kind === 'attention') return ALL;
    return undefined;
  });
  await window.render(
    <AyqGroundProvider>
      <AyqApplication />
    </AyqGroundProvider>,
  );
  // Let the shell's own reads settle.
  for (let i = 0; i < 5; i += 1) {
    await window.render(
      <AyqGroundProvider>
        <AyqApplication />
      </AyqGroundProvider>,
    );
  }
  const badge = window.container.querySelector(
    '[data-ayq-tab="today"] [data-ayq-waiting]',
  );
  // Seven groups — although they hold 21 records between them.
  assert.equal(
    badge?.getAttribute('data-ayq-waiting'),
    String(ALL.groups.length),
  );
  // And no other destination carries a count.
  assert.equal(
    window.container.querySelectorAll('[data-ayq-rail] [data-ayq-waiting]')
      .length,
    1,
  );
  await window.close();
});

test('Import history marks a failed file as handled, and says so (013 §1b)', async () => {
  const { AyqImportHistory } =
    await import('../src/ayq-screens/ayq-import-history.tsx');
  const record = {
    id: 'imp-1',
    at: '2026-09-01T09:00:00Z',
    file: '2 files',
    files: 2,
    records: 14,
    prepared: 14,
    imported: 14,
    duplicates: 0,
    skipped: 0,
    failed: 1,
    accountId: 'acc-1',
    accountName: 'Invented current',
    categorised: 0,
    filed: 0,
    matched: 0,
    matchesWaiting: 0,
    problems: [{ name: 'list.xml', code: 'not-camt' }],
  };
  let changed = 0;
  const window = await ayqOpenWindow(request => {
    if (request.kind === 'imports.list') return [record];
    if (request.kind === 'imports.markHandled') {
      return [
        {
          ...record,
          problems: [
            { ...record.problems[0], handledAt: '2026-09-02T10:00:00Z' },
          ],
        },
      ];
    }
    return undefined;
  });
  await window.render(
    <AyqGroundProvider>
      <AyqImportHistory
        round={0}
        onFailure={message => {
          throw new Error(message);
        }}
        onChanged={() => (changed += 1)}
      />
    </AyqGroundProvider>,
  );
  const line = () =>
    window.container.querySelector('[data-ayq-import-problem="list.xml"]');
  assert.equal(line()?.getAttribute('data-ayq-handled'), 'no');
  assert.ok(
    (line()?.textContent ?? '').includes(ayqText('reason.import.not-camt')),
  );

  await ayqPress(
    window.container.querySelector(
      '[data-ayq-action="import-handle-list.xml"]',
    ),
  );
  const sent = window.asked.filter(one => one.kind === 'imports.markHandled');
  assert.deepEqual(
    sent.map(one => [one.importId, one.name]),
    [['imp-1', 'list.xml']],
  );
  assert.equal(line()?.getAttribute('data-ayq-handled'), 'yes');
  assert.ok(
    (line()?.textContent ?? '').includes(
      ayqText('import.problems.handled', {
        when: ayqMoment('2026-09-02T10:00:00Z'),
      }),
    ),
  );
  // Today's count is asked again: the condition may no longer hold.
  assert.equal(changed, 1);
  await window.close();
});
