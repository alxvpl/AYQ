// Needs attention, on Today (010 with the corrections of 013).
//
// One row per condition the engine says holds, each with the one place to act
// on it. The engine decides what holds (010 §8.1); this draws it, and every
// word is the catalogue's (04 A24). No row is dismissed here: a row goes when
// its condition stops holding, and the one owner decision that can make it go
// — a failed file marked as handled — is made in Import history (013 §1b).

import type { ReactNode } from 'react';

import { makeStyles } from '@fluentui/react-components';

import type { AyqAttention } from '../ayq-ipc-contract.ts';
import { ayqCount, ayqText } from '../ayq-strings.ts';
import { AYQ_METRIC } from '../ayq-tokens.ts';
import { AyqPane } from '../ayq-ui/ayq-pane.tsx';

import { AyqAttentionRow } from './ayq-attention-row.tsx';
import type { AyqAttentionRoutes } from './ayq-attention-row.tsx';

const useStyles = makeStyles({
  list: {
    listStyleType: 'none',
    margin: '0',
    padding: `${AYQ_METRIC.space.small}px ${AYQ_METRIC.panePadding}px`,
    display: 'flex',
    flexDirection: 'column',
    gap: `${AYQ_METRIC.space.medium}px`,
  },
  none: { color: 'var(--ayq-ink-faint)' },
});

export function AyqAttentionPane({
  attention,
  routes,
}: {
  attention: AyqAttention;
  routes: AyqAttentionRoutes;
}): ReactNode {
  const styles = useStyles();
  return (
    <AyqPane
      mark="today-attention"
      title={ayqText('attention.title')}
      note={ayqCount(attention.groups.length)}
    >
      <ul
        className={styles.list}
        data-ayq-attention-groups={String(attention.groups.length)}
      >
        {attention.groups.length === 0 ? (
          <li className={styles.none}>{ayqText('attention.none')}</li>
        ) : (
          attention.groups.map(group => (
            <AyqAttentionRow key={group.key} group={group} routes={routes} />
          ))
        )}
      </ul>
    </AyqPane>
  );
}
