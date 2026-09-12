// Settings → Categories: the only place a category is made or renamed.
//
// One surface, because two would mean two answers to "what categories are
// there". Every other screen reads them from the engine, which reads them from
// the budget — 03 §1.2: AYQ keeps no parallel category database.
//
// Two consequences are stated rather than left to be discovered. Renaming a
// category moves the rules that file into it, because a rule keeps a category by
// name so that it outlives a budget (§4.2). And AYQ does not archive or delete a
// category here: Canon says nothing about what should become of the transactions
// filed under one, and an irreversible guess about somebody's history is the
// last thing this screen should offer.

import { Input, Select, makeStyles } from '@fluentui/react-components';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { ayqAsk } from '../ayq-bridge.ts';
import type { AyqCategory } from '../ayq-ipc-contract.ts';
import { ayqText } from '../ayq-strings.ts';
import { AYQ_METRIC } from '../ayq-tokens.ts';
import { AyqButton } from '../ayq-ui/ayq-button.tsx';
import { ayqBorder } from '../ayq-ui/ayq-css.ts';
import { AyqPane } from '../ayq-ui/ayq-pane.tsx';
import { AyqTable, type AyqColumn } from '../ayq-ui/ayq-table.tsx';

const useStyles = makeStyles({
  bar: {
    display: 'flex',
    gap: `${AYQ_METRIC.space.medium}px`,
    alignItems: 'center',
    flexWrap: 'wrap',
    padding: `10px ${AYQ_METRIC.space.wide}px`,
    backgroundColor: 'var(--ayq-pane)',
    ...ayqBorder('var(--ayq-line)'),
    borderRadius: 'var(--ayq-radius-medium)',
  },
  label: { color: 'var(--ayq-ink-quiet)', fontSize: 'var(--ayq-size-small)' },
  note: { margin: '0', color: 'var(--ayq-ink-quiet)' },
  said: { margin: '0', color: 'var(--ayq-ink)' },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: `${AYQ_METRIC.space.medium}px`,
    padding: `13px ${AYQ_METRIC.space.screen}px`,
  },
  inline: {
    display: 'flex',
    gap: `${AYQ_METRIC.space.small}px`,
    alignItems: 'center',
  },
  quiet: { color: 'var(--ayq-ink-faint)' },
  name: { width: '200px' },
});

export function AyqSettingsCategories({
  onFailure,
  onChanged,
}: {
  onFailure(message: string): void;
  onChanged(): void;
}): ReactNode {
  const styles = useStyles();
  const [categories, setCategories] = useState<readonly AyqCategory[] | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [made, setMade] = useState('');
  const [group, setGroup] = useState('');
  const [said, setSaid] = useState<string | null>(null);
  const [round, setRound] = useState(0);

  useEffect(() => {
    let live = true;
    void (async () => {
      const answer = await ayqAsk({ kind: 'categories.list' });
      if (!answer.ok) throw new Error(answer.message);
      if (answer.kind !== 'categories.list') return;
      if (!live) return;
      setCategories(answer.result);
      setGroup(one => (one === '' ? answer.result[0]?.groupId ?? '' : one));
    })().catch((error: unknown) => {
      if (live) onFailure(error instanceof Error ? error.message : String(error));
    });
    return () => {
      live = false;
    };
  }, [round, onFailure]);

  const again = useCallback(() => {
    setRound(one => one + 1);
    onChanged();
  }, [onChanged]);

  if (categories === null) {
    return <p className={styles.note}>{ayqText('common.loading')}</p>;
  }

  // Groups, in the order the categories arrived in, so the picker reads the way
  // the table does.
  const groups: Array<{ id: string; name: string }> = [];
  for (const one of categories) {
    if (!groups.some(other => other.id === one.groupId)) {
      groups.push({ id: one.groupId, name: one.groupName });
    }
  }

  const add = (): void => {
    if (made.trim() === '') {
      onFailure(ayqText('categories.needsName'));
      return;
    }
    void (async () => {
      const answer = await ayqAsk({
        kind: 'categories.create',
        name: made.trim(),
        groupId: group,
      });
      if (!answer.ok) throw new Error(answer.message);
      setSaid(ayqText('categories.made', { name: made.trim() }));
      setMade('');
      again();
    })().catch((error: unknown) => {
      onFailure(error instanceof Error ? error.message : String(error));
    });
  };

  const rename = (was: string): void => {
    if (renaming === null) return;
    if (renaming.name.trim() === '') {
      onFailure(ayqText('categories.needsName'));
      return;
    }
    const to = renaming.name.trim();
    void (async () => {
      const answer = await ayqAsk({
        kind: 'categories.rename',
        categoryId: renaming.id,
        name: to,
      });
      if (!answer.ok) throw new Error(answer.message);
      setSaid(ayqText('categories.renamed', { was, name: to }));
      setRenaming(null);
      again();
    })().catch((error: unknown) => {
      onFailure(error instanceof Error ? error.message : String(error));
    });
  };

  const columns: readonly AyqColumn<AyqCategory>[] = [
    {
      id: 'name',
      header: ayqText('categories.column.name'),
      cell: row =>
        renaming?.id === row.id ? (
          <span className={styles.inline} data-ayq-cell="name">
            <Input
              className={styles.name}
              size="small"
              value={renaming.name}
              data-ayq-category-name={row.id}
              aria-label={ayqText('categories.rename')}
              onChange={(_event, data) =>
                setRenaming({ id: row.id, name: data.value })
              }
            />
            <AyqButton
              size="small"
              mark="category-rename-save"
              onClick={() => rename(row.name)}
            >
              {ayqText('categories.rename.save')}
            </AyqButton>
            <AyqButton
              size="small"
              mark="category-rename-cancel"
              onClick={() => setRenaming(null)}
            >
              {ayqText('categories.rename.cancel')}
            </AyqButton>
          </span>
        ) : (
          <span className={styles.inline} data-ayq-cell="name">
            <span data-ayq-category={row.id}>{row.name}</span>
            <AyqButton
              size="small"
              mark={`category-rename-${row.id}`}
              onClick={() => {
                setSaid(null);
                setRenaming({ id: row.id, name: row.name });
              }}
            >
              {ayqText('categories.rename')}
            </AyqButton>
          </span>
        ),
    },
    {
      id: 'group',
      header: ayqText('categories.column.group'),
      cell: row => (
        <span data-ayq-cell="group" className={styles.quiet}>
          {row.groupName}
        </span>
      ),
    },
    {
      id: 'kind',
      header: ayqText('categories.column.kind'),
      cell: row => (
        <span data-ayq-cell="kind" className={styles.quiet}>
          {row.isIncome
            ? ayqText('categories.kind.income')
            : ayqText('categories.kind.expense')}
        </span>
      ),
    },
  ];

  return (
    <>
      <div className={styles.bar} data-ayq-category-new="">
        <span className={styles.label}>{ayqText('categories.new.name')}</span>
        <Input
          className={styles.name}
          value={made}
          data-ayq-new-category=""
          onChange={(_event, data) => setMade(data.value)}
        />
        <span className={styles.label}>{ayqText('categories.new.group')}</span>
        <Select
          value={group}
          data-ayq-new-group=""
          aria-label={ayqText('categories.new.group')}
          onChange={(_event, data) => setGroup(data.value)}
        >
          {groups.map(one => (
            <option key={one.id} value={one.id}>
              {one.name}
            </option>
          ))}
        </Select>
        <AyqButton filled mark="category-add" onClick={add}>
          {ayqText('categories.new.save')}
        </AyqButton>
      </div>

      <AyqPane mark="categories" title={ayqText('categories.title')}>
        <AyqTable
          mark="categories"
          columns={columns}
          rows={categories}
          keyOf={row => row.id}
          empty={ayqText('categories.empty')}
        />
        <div className={styles.body}>
          {said === null ? null : (
            <p className={styles.said} data-ayq-category-said="">
              {said}
            </p>
          )}
          <p className={styles.note} data-ayq-category-consequence="">
            {ayqText('categories.consequence')}
          </p>
          <p className={styles.note} data-ayq-no-archive="">
            {ayqText('categories.noArchive')}
          </p>
        </div>
      </AyqPane>
    </>
  );
}
