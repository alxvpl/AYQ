// Settings → Accounts: one switch, and nothing else (03 §7.6).
//
// Which balances make up available funds is a setting, so it is here. What each
// account holds, how far its statements reach and whether AYQ agrees with the
// bank are facts about the money, so they are on the Accounts screen — and this
// surface says so rather than showing a second, smaller copy of them.

import { Switch, makeStyles } from '@fluentui/react-components';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { ayqAsk } from '../ayq-bridge.ts';
import type { AyqAccountSummary } from '../ayq-ipc-contract.ts';
import { ayqText } from '../ayq-strings.ts';
import { AYQ_METRIC } from '../ayq-tokens.ts';
import { AyqButton } from '../ayq-ui/ayq-button.tsx';
import { AyqFigure } from '../ayq-ui/ayq-figure.tsx';
import { AyqPane } from '../ayq-ui/ayq-pane.tsx';
import { AyqTable, type AyqColumn } from '../ayq-ui/ayq-table.tsx';

const useStyles = makeStyles({
  note: {
    padding: `${AYQ_METRIC.space.screen}px`,
    color: 'var(--ayq-ink-quiet)',
    fontSize: 'var(--ayq-size-small)',
    display: 'flex',
    flexDirection: 'column',
    gap: `${AYQ_METRIC.space.medium}px`,
    alignItems: 'flex-start',
  },
});

export function AyqSettingsAccounts({
  onFailure,
  onChanged,
  onOpenAccounts,
}: {
  onFailure(message: string): void;
  onChanged(): void;
  onOpenAccounts(): void;
}): ReactNode {
  const styles = useStyles();
  const [accounts, setAccounts] = useState<readonly AyqAccountSummary[]>([]);
  const [round, setRound] = useState(0);

  useEffect(() => {
    let live = true;
    void (async () => {
      const listed = await ayqAsk({ kind: 'accounts.list' });
      if (!listed.ok) throw new Error(listed.message);
      if (live) setAccounts(listed.result as AyqAccountSummary[]);
    })().catch((error: unknown) => {
      if (live) onFailure(error instanceof Error ? error.message : String(error));
    });
    return () => {
      live = false;
    };
  }, [round, onFailure]);

  const flag = useCallback(
    (accountId: string, counts: boolean) => {
      void (async () => {
        const done = await ayqAsk({
          kind: 'accounts.setFlag',
          accountId,
          countsTowardFunds: counts,
        });
        if (!done.ok) {
          onFailure(done.message);
          return;
        }
        setAccounts(done.result as AyqAccountSummary[]);
        setRound(one => one + 1);
        // Available funds have changed, and so has everything computed from
        // them. The shell reads the summary again rather than keeping the one
        // it had.
        onChanged();
      })();
    },
    [onFailure, onChanged],
  );

  const columns: readonly AyqColumn<AyqAccountSummary>[] = [
    {
      id: 'name',
      header: ayqText('accounts.column.name'),
      cell: account => account.name,
    },
    {
      id: 'counts',
      header: ayqText('accounts.column.counts'),
      cell: account => (
        <Switch
          data-ayq-funds-switch={account.id}
          checked={account.countsTowardFunds}
          aria-label={ayqText('accounts.detail.counts')}
          onChange={(_event, data) => flag(account.id, data.checked)}
        />
      ),
    },
    {
      id: 'balance',
      header: ayqText('accounts.column.balance'),
      figures: true,
      cell: account => <AyqFigure cents={account.balanceCents} />,
    },
  ];

  return (
    <AyqPane mark="settings-accounts">
      <AyqTable
        mark="settings-accounts"
        columns={columns}
        rows={accounts}
        keyOf={account => account.id}
        empty={ayqText('accounts.empty')}
      />
      <div className={styles.note}>
        <span>{ayqText('settings.accounts.only')}</span>
        <span>{ayqText('settings.accounts.transfers')}</span>
        <AyqButton size="small" mark="open-accounts" onClick={onOpenAccounts}>
          {ayqText('settings.accounts.open')}
        </AyqButton>
      </div>
    </AyqPane>
  );
}
