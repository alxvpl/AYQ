// Settings → Categories: the only place a category is made or renamed.
//
// One surface, because two would mean two answers to "what categories are
// there". Every other screen reads them from the engine, which reads them from
// the budget — 03 §1.2: AYQ keeps no parallel category database.
//
// Two consequences are stated rather than left to be discovered. Renaming a
// category moves the rules that file into it, because a rule keeps a category by
// name so that it outlives a budget (§4.2). And removing one (04 A35) is never
// a guess about somebody's history: what still uses the category is counted by
// the engine and shown first, a category in use cannot go without a stated
// destination for what used it, and the outcome is one in which every record
// survives — in another category, or explicitly Uncategorised (§4.5, §7.23).
//
// Rows keep the budget's own order. Categories and groups carry meaning in
// their order (A31), so nothing here sorts them.

import { Input, Select, makeStyles, mergeClasses } from '@fluentui/react-components';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { ayqAsk } from '../ayq-bridge.ts';
import type {
  AyqCategory,
  AyqCategoryDestination,
  AyqCategoryImpact,
} from '../ayq-ipc-contract.ts';
import { ayqCount, ayqText } from '../ayq-strings.ts';
import { AYQ_METRIC } from '../ayq-tokens.ts';
import { AyqButton } from '../ayq-ui/ayq-button.tsx';
import { ayqBorder } from '../ayq-ui/ayq-css.ts';
import { useAyqFieldStyles } from '../ayq-ui/ayq-field.ts';
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
  rowActions: { display: 'flex', gap: '4px', justifyContent: 'flex-end' },
  // Template r003's row button: 24 high, quiet until hovered.
  rowButton: {
    height: '24px',
    minHeight: '24px',
    padding: `0 ${AYQ_METRIC.space.medium}px`,
    backgroundColor: 'transparent',
    color: 'var(--ayq-ink-quiet)',
    fontWeight: 400,
    ...ayqBorder('transparent'),
    ':hover': {
      backgroundColor: 'var(--ayq-row-hover)',
      color: 'var(--ayq-ink)',
      ...ayqBorder('var(--ayq-control-edge)'),
    },
  },
  danger: { ':hover': { color: 'var(--ayq-danger)' } },
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
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: `${AYQ_METRIC.space.small}px`,
    padding: `${AYQ_METRIC.space.medium}px ${AYQ_METRIC.space.screen}px`,
    ...ayqBorder('var(--ayq-line-strong)'),
    borderRadius: 'var(--ayq-radius-medium)',
    backgroundColor: 'var(--ayq-pane)',
  },
  uses: { margin: '0', paddingLeft: '18px', color: 'var(--ayq-ink)' },
});

export function AyqSettingsCategories({
  onFailure,
  onChanged,
}: {
  onFailure(message: string): void;
  onChanged(): void;
}): ReactNode {
  const styles = useStyles();
  const fields = useAyqFieldStyles();
  const [categories, setCategories] = useState<readonly AyqCategory[] | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  // The category being removed, and what the engine says still uses it. The
  // impact is asked for when the panel opens and never remembered from before.
  const [removing, setRemoving] = useState<string | null>(null);
  const [impact, setImpact] = useState<AyqCategoryImpact | null>(null);
  const [destination, setDestination] = useState('');
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

  useEffect(() => {
    if (removing === null) {
      setImpact(null);
      setDestination('');
      return;
    }
    let live = true;
    void (async () => {
      const answer = await ayqAsk({ kind: 'categories.impact', categoryId: removing });
      if (!answer.ok) throw new Error(answer.message);
      if (answer.kind !== 'categories.impact') return;
      if (live) setImpact(answer.result);
    })().catch((error: unknown) => {
      if (live) onFailure(error instanceof Error ? error.message : String(error));
    });
    return () => {
      live = false;
    };
  }, [removing, onFailure]);

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

  const move = (row: AyqCategory, groupId: string): void => {
    void (async () => {
      const answer = await ayqAsk({ kind: 'categories.move', categoryId: row.id, groupId });
      if (!answer.ok) throw new Error(answer.message);
      if (answer.kind !== 'categories.move') return;
      const now = answer.result.find(one => one.id === row.id);
      setSaid(ayqText('categories.moved', { name: row.name, group: now?.groupName ?? '' }));
      setMoving(null);
      again();
    })().catch((error: unknown) => {
      onFailure(error instanceof Error ? error.message : String(error));
    });
  };

  const remove = (): void => {
    if (impact === null) return;
    let chosen: AyqCategoryDestination | undefined;
    if (!impact.unused) {
      if (destination === '') {
        onFailure(ayqText('categories.remove.destination.choose'));
        return;
      }
      chosen =
        destination === 'uncategorised'
          ? { kind: 'uncategorised' }
          : { kind: 'category', categoryId: destination };
    }
    void (async () => {
      const answer = await ayqAsk({
        kind: 'categories.remove',
        categoryId: impact.categoryId,
        destination: chosen,
      });
      if (!answer.ok) throw new Error(answer.message);
      if (answer.kind !== 'categories.remove') return;
      const done = answer.result;
      setSaid(
        impact.unused
          ? ayqText('categories.removed', { name: done.removed })
          : done.movedTo === null
            ? ayqText('categories.removed.uncategorised', {
                name: done.removed,
                transactions: ayqCount(done.transactions),
                planned: ayqCount(done.planned),
                rules: ayqCount(done.rulesRemoved),
              })
            : ayqText('categories.removed.to', {
                name: done.removed,
                transactions: ayqCount(done.transactions),
                planned: ayqCount(done.planned),
                destination: done.movedTo,
                rules: ayqCount(done.rulesMoved),
              }),
      );
      setRemoving(null);
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
          </span>
        ),
    },
    {
      id: 'actions',
      header: '',
      cell: row =>
        renaming?.id === row.id ? null : (
          <span className={styles.rowActions} data-ayq-cell="actions">
            <AyqButton
              className={styles.rowButton}
              mark={`category-rename-${row.id}`}
              onClick={() => {
                setSaid(null);
                setRenaming({ id: row.id, name: row.name });
              }}
            >
              {ayqText('categories.rename')}
            </AyqButton>
            <AyqButton
              className={styles.rowButton}
              mark={`category-move-${row.id}`}
              onClick={() => {
                setSaid(null);
                setMoving(moving === row.id ? null : row.id);
              }}
            >
              {ayqText('categories.move')}
            </AyqButton>
            <AyqButton
              className={mergeClasses(styles.rowButton, styles.danger)}
              mark={`category-remove-${row.id}`}
              onClick={() => {
                setSaid(null);
                setRemoving(removing === row.id ? null : row.id);
              }}
            >
              {ayqText('categories.remove')}
            </AyqButton>
          </span>
        ),
    },
    {
      id: 'group',
      header: ayqText('categories.column.group'),
      cell: row =>
        moving === row.id ? (
          <span className={styles.inline} data-ayq-cell="group">
            <Select
              data-ayq-move-group={row.id}
              aria-label={ayqText('categories.move.to')}
              value={row.groupId}
              onChange={(_event, data) => move(row, data.value)}
            >
              {groups.map(one => (
                <option key={one.id} value={one.id}>
                  {one.name}
                </option>
              ))}
            </Select>
            <AyqButton size="small" mark="category-move-cancel" onClick={() => setMoving(null)}>
              {ayqText('categories.move.cancel')}
            </AyqButton>
          </span>
        ) : (
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
      <div className={fields.bar} data-ayq-category-new="">
        <span className={fields.label}>{ayqText('categories.new.name')}</span>
        <Input
          className={mergeClasses(fields.field, styles.name)}
          value={made}
          data-ayq-new-category=""
          onChange={(_event, data) => setMade(data.value)}
        />
        <span className={fields.label}>{ayqText('categories.new.group')}</span>
        <Select
          className={fields.field}
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

      {removing === null ? null : (
        <div className={styles.panel} data-ayq-category-remove={removing} role="region" aria-label={ayqText('categories.remove')}>
          {impact === null ? (
            <p className={styles.note}>{ayqText('categories.remove.checking')}</p>
          ) : impact.unused ? (
            <p className={styles.said} data-ayq-remove-unused="">
              {ayqText('categories.remove.unused', { name: impact.name })}
            </p>
          ) : (
            <>
              <p className={styles.said} data-ayq-remove-in-use="">
                {ayqText('categories.remove.inUse', { name: impact.name })}
              </p>
              <ul className={styles.uses} data-ayq-remove-impact="">
                {impact.transactions === 0 ? null : (
                  <li>{ayqText('categories.remove.transactions', { count: ayqCount(impact.transactions) })}</li>
                )}
                {impact.rules === 0 ? null : (
                  <li>{ayqText('categories.remove.rules', { count: ayqCount(impact.rules) })}</li>
                )}
                {impact.planned === 0 ? null : (
                  <li>{ayqText('categories.remove.planned', { count: ayqCount(impact.planned) })}</li>
                )}
                {impact.plannedMonths === 0 ? null : (
                  <li>{ayqText('categories.remove.months', { count: ayqCount(impact.plannedMonths) })}</li>
                )}
              </ul>
              <span className={styles.inline}>
                <span className={styles.label}>{ayqText('categories.remove.destination')}</span>
                <Select
                  data-ayq-remove-destination=""
                  aria-label={ayqText('categories.remove.destination')}
                  value={destination}
                  onChange={(_event, data) => setDestination(data.value)}
                >
                  <option value="">{ayqText('categories.remove.destination.choose')}</option>
                  <option value="uncategorised">
                    {ayqText('categories.remove.destination.uncategorised')}
                  </option>
                  {categories
                    .filter(one => one.id !== impact.categoryId && one.isIncome === impact.isIncome)
                    .map(one => (
                      <option key={one.id} value={one.id}>
                        {one.name}
                      </option>
                    ))}
                </Select>
              </span>
              {destination === '' ? null : (
                <p className={styles.note} data-ayq-remove-consequence="">
                  {destination === 'uncategorised'
                    ? ayqText('categories.remove.consequence.uncategorised', {
                        rules: ayqCount(impact.rules),
                      })
                    : ayqText('categories.remove.consequence.category', {
                        destination:
                          categories.find(one => one.id === destination)?.name ?? '',
                      })}
                </p>
              )}
            </>
          )}
          <span className={styles.inline}>
            <AyqButton
              filled
              size="small"
              mark="category-remove-confirm"
              disabled={impact === null || (!impact.unused && destination === '')}
              onClick={remove}
            >
              {ayqText('categories.remove.confirm', { name: impact?.name ?? '' })}
            </AyqButton>
            <AyqButton size="small" mark="category-remove-cancel" onClick={() => setRemoving(null)}>
              {ayqText('categories.remove.cancel')}
            </AyqButton>
          </span>
        </div>
      )}

      <AyqPane mark="categories">
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
