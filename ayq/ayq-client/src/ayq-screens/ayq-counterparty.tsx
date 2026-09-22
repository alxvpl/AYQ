// One counterparty, managed (04 A37, A29; 03 §3).
//
// A **secondary surface**, not a rail destination: reached from a transaction
// in the Register and from a counterparty on Review, and it offers a way back.
// It holds the four things a person may do about who a counterparty is, and
// nothing about what that counterparty costs — an analytical question belongs
// to AYQ Analyses, not here.
//
// The display name is the owner's and only a name: it never replaces what the
// bank printed, which stays below as evidence, one line per imported variant.
// The rules that mention the counterparty are shown through the same card the
// Register uses, so they are inspected, corrected and removed here too. And
// identity is corrected explicitly: a variant that was said to be this
// counterparty can be unsaid, one decision at a time; and the whole
// counterparty can be said to be another. A merge keeps every record, and the
// screen states before the button that it is undone only by a further
// identity decision — removing those variants from the survivor, one by one.

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { Input, makeStyles, Select } from '@fluentui/react-components';

import { ayqAsk } from '../ayq-bridge.ts';
import type {
  AyqCategory,
  AyqCounterparty,
  AyqCounterpartyDetail,
  AyqCounterpartyVariant,
} from '../ayq-ipc-contract.ts';
import { ayqCount, ayqDate, ayqList, ayqText } from '../ayq-strings.ts';
import { AYQ_METRIC } from '../ayq-tokens.ts';
import { AyqButton } from '../ayq-ui/ayq-button.tsx';
import { ayqBorderTop } from '../ayq-ui/ayq-css.ts';
import { AyqFigure } from '../ayq-ui/ayq-figure.tsx';
import { AyqPane } from '../ayq-ui/ayq-pane.tsx';
import { AyqStateChip } from '../ayq-ui/ayq-state-chip.tsx';

import { AyqRuleCard } from './ayq-rule-card.tsx';

const useStyles = makeStyles({
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: `${AYQ_METRIC.space.wide}px`,
    padding: `13px ${AYQ_METRIC.space.screen}px`,
  },
  name: {
    margin: '0',
    fontFamily: 'var(--ayq-font-display)',
    fontSize: 'var(--ayq-size-heading)',
    color: 'var(--ayq-ink)',
    overflowWrap: 'anywhere',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: `${AYQ_METRIC.space.small}px`,
    paddingTop: `${AYQ_METRIC.space.medium}px`,
    ...ayqBorderTop('var(--ayq-line)'),
  },
  label: {
    fontSize: 'var(--ayq-size-small)',
    color: 'var(--ayq-ink-quiet)',
    fontWeight: 600,
  },
  note: {
    margin: '0',
    color: 'var(--ayq-ink-quiet)',
    fontSize: 'var(--ayq-size-small)',
  },
  said: { margin: '0', color: 'var(--ayq-ink)' },
  inline: {
    display: 'flex',
    gap: `${AYQ_METRIC.space.small}px`,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  variant: {
    display: 'flex',
    flexDirection: 'column',
    gap: `${AYQ_METRIC.space.tight}px`,
    padding: `${AYQ_METRIC.space.small}px 0`,
  },
  mono: { fontFamily: 'var(--ayq-font-mono)', fontSize: '12px' },
  boundary: {
    color: 'var(--ayq-ink-quiet)',
    fontSize: 'var(--ayq-size-small)',
  },
});

type AyqIdentityMode =
  | { kind: 'idle' }
  | { kind: 'undo'; variant: AyqCounterpartyVariant }
  | { kind: 'merge' };

export function AyqCounterpartyScreen({
  counterpartyKey,
  onFailure,
  onChanged,
  onOpenRegister,
  onOpenKey,
  onBack,
}: {
  counterpartyKey: string;
  onFailure(message: string): void;
  /** Something about the budget moved; the shell reads again. */
  onChanged(): void;
  onOpenRegister(counterpartyKey: string): void;
  /** The transactions went to another counterparty; the screen follows. */
  onOpenKey(counterpartyKey: string): void;
  onBack(): void;
}): ReactNode {
  const styles = useStyles();
  const [detail, setDetail] = useState<AyqCounterpartyDetail | null>(null);
  const [categories, setCategories] = useState<readonly AyqCategory[]>([]);
  const [round, setRound] = useState(0);
  const [said, setSaid] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [typedName, setTypedName] = useState('');
  const [mode, setMode] = useState<AyqIdentityMode>({ kind: 'idle' });
  /** Candidates for a merge, loaded only when one is being made. */
  const [others, setOthers] = useState<readonly AyqCounterparty[] | null>(null);
  const [search, setSearch] = useState('');
  const [targetKey, setTargetKey] = useState('');

  useEffect(() => {
    let live = true;
    void (async () => {
      const answered = await ayqAsk({
        kind: 'counterparty.detail',
        key: counterpartyKey,
      });
      if (!answered.ok) throw new Error(answered.message);
      const filed = await ayqAsk({ kind: 'categories.list' });
      if (!filed.ok) throw new Error(filed.message);
      if (!live) return;
      setDetail(answered.result as AyqCounterpartyDetail);
      setCategories(filed.result as AyqCategory[]);
    })().catch((error: unknown) => {
      if (live)
        {onFailure(error instanceof Error ? error.message : String(error));}
    });
    return () => {
      live = false;
    };
  }, [counterpartyKey, round, onFailure]);

  useEffect(() => {
    if (mode.kind !== 'merge') return;
    let live = true;
    void (async () => {
      const listed = await ayqAsk({
        kind: 'counterparties.list',
        filter: search.trim() === '' ? undefined : { search: search.trim() },
      });
      if (!listed.ok) throw new Error(listed.message);
      if (live) setOthers((listed.result as { rows: AyqCounterparty[] }).rows);
    })().catch((error: unknown) => {
      if (live)
        {onFailure(error instanceof Error ? error.message : String(error));}
    });
    return () => {
      live = false;
    };
  }, [mode.kind, search, onFailure]);

  const again = (what: string): void => {
    setSaid(what);
    setMode({ kind: 'idle' });
    setRound(one => one + 1);
    onChanged();
  };

  const fail = (error: unknown): void => {
    onFailure(error instanceof Error ? error.message : String(error));
  };

  if (detail === null) {
    return <p className={styles.note}>{ayqText('common.loading')}</p>;
  }
  const { counterparty, variants, rules } = detail;
  const target = others?.find(one => one.key === targetKey) ?? null;

  const rename = (displayName: string): void => {
    void (async () => {
      const answered = await ayqAsk({
        kind: 'counterparty.setName',
        counterpartyKey: counterparty.key,
        displayName,
      });
      if (!answered.ok) throw new Error(answered.message);
      if (answered.kind !== 'counterparty.setName') return;
      again(
        displayName.trim() === ''
          ? ayqText('counterparty.renamed.cleared')
          : ayqText('counterparty.renamed', {
              name: answered.result.counterparty.name,
            }),
      );
    })().catch(fail);
  };

  const undo = (variant: AyqCounterpartyVariant): void => {
    if (variant.aliasId === null) return;
    void (async () => {
      const answered = await ayqAsk({
        kind: 'alias.remove',
        aliasId: variant.aliasId ?? '',
      });
      if (!answered.ok) throw new Error(answered.message);
      if (answered.kind !== 'alias.remove') return;
      again(
        ayqText('counterparty.variant.undone', {
          variant: variant.key,
          count: ayqCount(answered.result.moved),
        }),
      );
    })().catch(fail);
  };

  const merge = (): void => {
    if (target === null) return;
    void (async () => {
      const answered = await ayqAsk({
        kind: 'counterparty.merge',
        counterpartyKey: counterparty.key,
        intoKey: target.key,
      });
      if (!answered.ok) throw new Error(answered.message);
      if (answered.kind !== 'counterparty.merge') return;
      setSaid(
        ayqText('counterparty.merged', {
          name: counterparty.name,
          target: answered.result.counterpartyName,
          moved: ayqCount(answered.result.moved),
        }),
      );
      setMode({ kind: 'idle' });
      onChanged();
      // The transactions went somewhere; the screen follows them.
      onOpenKey(answered.result.counterpartyKey);
    })().catch(fail);
  };

  return (
    <>
      <AyqPane mark="counterparty">
        <div
          className={styles.body}
          data-ayq-counterparty-page={counterparty.key}
        >
          <div className={styles.inline}>
            <h3 className={styles.name} data-ayq-cp-name="">
              {counterparty.name}
            </h3>
            <span className={styles.mono}>{counterparty.key}</span>
          </div>
          <span className={styles.note} data-ayq-cp-seen="">
            {counterparty.transactions === 0
              ? ayqText('counterparty.none')
              : ayqText('counterparty.seen', {
                  first: ayqDate(counterparty.firstDate),
                  last: ayqDate(counterparty.lastDate),
                  count: ayqCount(counterparty.transactions),
                })}
          </span>

          {said === null ? null : (
            <p className={styles.said} data-ayq-cp-said="">
              {said}
            </p>
          )}

          {/* The owner's name, and only a name (8 §8.3). */}
          <div className={styles.section}>
            <span className={styles.label}>{ayqText('counterparty.name')}</span>
            <p className={styles.note}>
              {ayqText(
                detail.ownerNamed
                  ? 'counterparty.name.owner'
                  : 'counterparty.name.automatic',
              )}
            </p>
            {renaming ? (
              <div className={styles.inline}>
                <Input
                  size="small"
                  appearance="underline"
                  aria-label={ayqText('counterparty.name')}
                  data-ayq-cp-rename-input=""
                  value={typedName}
                  onChange={(_event, data) => setTypedName(data.value)}
                />
                <AyqButton
                  size="small"
                  filled
                  mark="cp-rename-save"
                  onClick={() => {
                    setRenaming(false);
                    rename(typedName);
                  }}
                >
                  {ayqText('counterparty.name.save')}
                </AyqButton>
                <AyqButton
                  size="small"
                  mark="cp-rename-cancel"
                  onClick={() => setRenaming(false)}
                >
                  {ayqText('counterparty.cancel')}
                </AyqButton>
              </div>
            ) : (
              <div className={styles.inline}>
                <AyqButton
                  size="small"
                  mark="cp-rename"
                  onClick={() => {
                    setTypedName(counterparty.name);
                    setRenaming(true);
                  }}
                >
                  {ayqText('counterparty.name.edit')}
                </AyqButton>
                {detail.ownerNamed ? (
                  <AyqButton
                    size="small"
                    mark="cp-rename-clear"
                    onClick={() => rename('')}
                  >
                    {ayqText('counterparty.name.clear')}
                  </AyqButton>
                ) : null}
              </div>
            )}
          </div>

          {/* The evidence, never overwritten (03 §3.5, §3.6). */}
          <div className={styles.section} data-ayq-cp-evidence="">
            <span className={styles.label}>
              {ayqText('counterparty.evidence')}
            </span>
            <p className={styles.note}>
              {ayqText('counterparty.evidence.note')}
            </p>
            {variants.map(variant => (
              <div
                key={variant.key}
                className={styles.variant}
                data-ayq-cp-variant={variant.key}
              >
                <div className={styles.inline}>
                  <span className={styles.mono}>{variant.key}</span>
                  <AyqStateChip
                    state={variant.aliased ? 'confirmed' : 'neutral'}
                    label={ayqText(
                      variant.aliased
                        ? 'counterparty.variant.byHand'
                        : 'counterparty.variant.byStatement',
                    )}
                  />
                  <span className={styles.note}>
                    {ayqCount(variant.transactions)} ·{' '}
                    {ayqDate(variant.firstDate)} – {ayqDate(variant.lastDate)}
                  </span>
                </div>
                <span className={styles.note} data-ayq-cp-variant-names="">
                  {ayqList(variant.names)}
                </span>
                {variant.aliasId === null || mode.kind !== 'idle' ? null : (
                  <div className={styles.inline}>
                    <AyqButton
                      size="small"
                      mark={`cp-alias-undo-${variant.key}`}
                      onClick={() => setMode({ kind: 'undo', variant })}
                    >
                      {ayqText('counterparty.variant.undo')}
                    </AyqButton>
                  </div>
                )}
                {mode.kind === 'undo' && mode.variant.key === variant.key ? (
                  <>
                    <p className={styles.note} data-ayq-cp-undo-consequence="">
                      {ayqText('counterparty.variant.undo.consequence', {
                        count: ayqCount(variant.transactions),
                        variant:
                          ayqList(variant.names.slice(0, 1)) || variant.key,
                        key: variant.key,
                      })}
                    </p>
                    <div className={styles.inline}>
                      <AyqButton
                        size="small"
                        filled
                        mark="cp-alias-undo-confirm"
                        onClick={() => undo(variant)}
                      >
                        {ayqText('counterparty.variant.undo.confirm')}
                      </AyqButton>
                      <AyqButton
                        size="small"
                        mark="cp-cancel"
                        onClick={() => setMode({ kind: 'idle' })}
                      >
                        {ayqText('counterparty.cancel')}
                      </AyqButton>
                    </div>
                  </>
                ) : null}
              </div>
            ))}
          </div>

          {/* The rules that mention it, correctable where they are seen (A7). */}
          <div
            className={styles.section}
            data-ayq-cp-rules={String(rules.length)}
          >
            <span className={styles.label}>
              {ayqText('counterparty.rules')}
            </span>
            {rules.length === 0 ? (
              <p className={styles.note}>
                {ayqText('counterparty.rules.none')}
              </p>
            ) : (
              rules.map(rule => (
                <AyqRuleCard
                  key={rule.id}
                  rule={rule}
                  categories={categories}
                  onFailure={onFailure}
                  onDone={again}
                />
              ))
            )}
          </div>

          {/* Identity: this counterparty is really another one (03 §3.6). */}
          <div className={styles.section} data-ayq-cp-identity="">
            <span className={styles.label}>
              {ayqText('counterparty.identity')}
            </span>
            {mode.kind === 'merge' ? (
              <>
                <Input
                  size="small"
                  data-ayq-cp-merge-search=""
                  aria-label={ayqText('counterparty.merge.search')}
                  placeholder={ayqText('counterparty.merge.search')}
                  value={search}
                  onChange={(_event, data) => setSearch(data.value)}
                />
                <Select
                  data-ayq-cp-merge-target=""
                  aria-label={ayqText('counterparty.merge.choose')}
                  value={targetKey}
                  onChange={(_event, data) => setTargetKey(data.value)}
                >
                  <option value="">
                    {ayqText('counterparty.merge.choose')}
                  </option>
                  {(others ?? [])
                    .filter(one => one.key !== counterparty.key)
                    .map(one => (
                      <option key={one.key} value={one.key}>
                        {one.name}
                      </option>
                    ))}
                </Select>
                {target === null ? null : (
                  <p className={styles.note} data-ayq-cp-merge-consequence="">
                    {ayqText('counterparty.merge.consequence', {
                      variants: ayqCount(variants.length),
                      name: counterparty.name,
                      target: target.name,
                      count: ayqCount(counterparty.transactions),
                    })}
                  </p>
                )}
                <div className={styles.inline}>
                  <AyqButton
                    size="small"
                    filled
                    mark="cp-merge-confirm"
                    disabled={target === null}
                    onClick={merge}
                  >
                    {ayqText('counterparty.merge.confirm', {
                      target: target?.name ?? '…',
                    })}
                  </AyqButton>
                  <AyqButton
                    size="small"
                    mark="cp-cancel"
                    onClick={() => setMode({ kind: 'idle' })}
                  >
                    {ayqText('counterparty.cancel')}
                  </AyqButton>
                </div>
              </>
            ) : (
              <div className={styles.inline}>
                <AyqButton
                  size="small"
                  mark="cp-merge"
                  disabled={
                    mode.kind !== 'idle' || counterparty.transactions === 0
                  }
                  onClick={() => {
                    setTargetKey('');
                    setMode({ kind: 'merge' });
                  }}
                >
                  {ayqText('counterparty.merge')}
                </AyqButton>
              </div>
            )}
          </div>

          <div className={styles.section}>
            <span className={styles.label}>
              {ayqText('counterparty.recent')}
            </span>
            {detail.recent.slice(0, 6).map(row => (
              <div
                key={row.id}
                className={styles.inline}
                data-ayq-cp-recent={row.id}
              >
                <span className={styles.note}>{ayqDate(row.date)}</span>
                <span>{row.payee ?? ''}</span>
                <AyqFigure cents={row.amountCents} />
              </div>
            ))}
            <div className={styles.inline}>
              <AyqButton
                size="small"
                mark="cp-register"
                onClick={() => onOpenRegister(counterparty.key)}
              >
                {ayqText('today.open.register')}
              </AyqButton>
            </div>
          </div>
        </div>
      </AyqPane>

      <p className={styles.boundary}>
        <AyqButton size="small" mark="cp-back" onClick={onBack}>
          {ayqText('counterparty.back')}
        </AyqButton>
      </p>
    </>
  );
}
