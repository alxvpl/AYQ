// One row of Needs attention: how many, what, and the one place to act on it
// (010 §6.1; 013 §4). The engine decided that the condition holds; this only
// draws it, in the catalogue's words (04 A24).

import type { ReactNode } from 'react';

import { makeStyles } from '@fluentui/react-components';

import type { AyqDestination } from '../ayq-destinations.ts';
import type { AyqAttentionGroup } from '../ayq-ipc-contract.ts';
import {
  ayqCount,
  ayqList,
  ayqMoment,
  ayqMoney,
  ayqText,
} from '../ayq-strings.ts';
import type { AyqStringKey } from '../ayq-strings.ts';
import { AYQ_METRIC, AYQ_TYPE } from '../ayq-tokens.ts';
import { AyqButton } from '../ayq-ui/ayq-button.tsx';
import { AyqStateChip } from '../ayq-ui/ayq-state-chip.tsx';

const useStyles = makeStyles({
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: `${AYQ_METRIC.space.medium}px`,
    flexWrap: 'wrap',
  },
  count: {
    minWidth: '28px',
    textAlign: 'right',
    fontVariantNumeric: AYQ_TYPE.figures,
    fontWeight: AYQ_TYPE.weight.bold,
  },
  title: { fontWeight: AYQ_TYPE.weight.semibold },
  note: { color: 'var(--ayq-ink-quiet)', fontSize: 'var(--ayq-size-small)' },
  actions: {
    marginLeft: 'auto',
    display: 'flex',
    gap: `${AYQ_METRIC.space.small}px`,
    flexWrap: 'wrap',
  },
});

const TITLE: Record<AyqAttentionGroup['kind'], AyqStringKey> = {
  'due-today': 'attention.due-today',
  overdue: 'attention.overdue',
  'reconciliation-difference': 'attention.reconciliation-difference',
  'balance-unknown': 'attention.balance-unknown',
  'import-failed': 'attention.import-failed',
  'backup-failed': 'attention.backup-failed',
  review: 'attention.review',
};

export type AyqAttentionRoutes = {
  open(destination: AyqDestination): void;
  /** The account's own detail, where Set account balance lives (013 §4). */
  openAccount(accountId: string): void;
  /** Settings → Data & Backup. */
  openBackup(): void;
};

export function AyqAttentionRow({
  group,
  routes,
}: {
  group: AyqAttentionGroup;
  routes: AyqAttentionRoutes;
}): ReactNode {
  const styles = useStyles();

  let note: string | null = null;
  let actions: ReactNode;
  switch (group.kind) {
    case 'due-today':
    case 'overdue':
      note =
        group.amountCents === undefined
          ? null
          : ayqText('attention.overdue.note', { amount: ayqMoney(group.amountCents) });
      actions = (
        <AyqButton
          mark={`attention-${group.kind}`}
          onClick={() => routes.open('upcoming')}
        >
          {ayqText('attention.open.upcoming')}
        </AyqButton>
      );
      break;
    case 'review':
      actions = (
        <AyqButton
          mark="attention-review"
          onClick={() => routes.open('review')}
        >
          {ayqText('attention.open.review')}
        </AyqButton>
      );
      break;
    case 'reconciliation-difference':
    case 'balance-unknown':
      note = ayqList((group.accounts ?? []).map(one => one.accountName));
      // One route per account, and for an unknown balance it is the one Set
      // account balance path the account's own detail already has (013 §4).
      actions = (group.accounts ?? []).map(one => (
        <AyqButton
          key={one.accountId}
          mark={`attention-${group.kind}-${one.accountId}`}
          onClick={() => routes.openAccount(one.accountId)}
        >
          {ayqText(
            group.kind === 'balance-unknown'
              ? 'attention.setBalance'
              : 'attention.openAccount',
            { account: one.accountName },
          )}
        </AyqButton>
      ));
      break;
    case 'import-failed':
      note = ayqList((group.files ?? []).map(one => one.name));
      actions = (
        <AyqButton
          mark="attention-import-failed"
          onClick={() => routes.open('import')}
        >
          {ayqText('attention.open.import')}
        </AyqButton>
      );
      break;
    case 'backup-failed':
    default:
      note =
        group.backup === undefined
          ? null
          : ayqText('attention.backup-failed.note', {
              when: ayqMoment(group.backup.at),
              why:
                group.backup.failure === null
                  ? ''
                  : ayqText(`backup.failure.${group.backup.failure}`),
            });
      actions = (
        <AyqButton
          mark="attention-backup-failed"
          onClick={() => routes.openBackup()}
        >
          {ayqText('attention.open.backup')}
        </AyqButton>
      );
      break;
  }

  return (
    <li className={styles.item} data-ayq-attention={group.kind}>
      <span className={styles.count}>{ayqCount(group.count)}</span>
      {/* A state, not the accent (04 A17). */}
      <AyqStateChip state="overdue" label={ayqText('attention.state')} />
      <span className={styles.title}>{ayqText(TITLE[group.kind])}</span>
      {note === null || note === '' ? null : (
        <span className={styles.note}>{note}</span>
      )}
      <span className={styles.actions}>{actions}</span>
    </li>
  );
}
