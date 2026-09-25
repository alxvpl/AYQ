import type { JSX, KeyboardEvent } from 'react';
import { useEffect, useState } from 'react';
import {
  Dropdown,
  Field,
  Input,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Option,
  Button,
} from '@fluentui/react-components';
import { presetMatching, resolvePreset, type PeriodPreset } from '../dates.js';
import { commitPeriodDate } from '../context.js';
import { formatDate } from '../format.js';
import { useLocale, useText } from './text.js';
import { CoverageIndicator } from './coverage.js';
import type {
  AnalysisContext,
  AnalysisResult,
  AyqAnalyticalSnapshot,
  CategorySelectionEntry,
  ComparisonMode,
  IsoDate,
} from '../types.js';
import type { StringKey } from '../strings.js';

const PRESET_KEYS: Record<PeriodPreset, StringKey> = {
  thisMonth: 'context.period.preset.thisMonth',
  lastMonth: 'context.period.preset.lastMonth',
  thisQuarter: 'context.period.preset.thisQuarter',
  lastQuarter: 'context.period.preset.lastQuarter',
  thisYear: 'context.period.preset.thisYear',
  lastYear: 'context.period.preset.lastYear',
  custom: 'context.period.preset.custom',
};

const PRESET_CHOICES = (Object.keys(PRESET_KEYS) as PeriodPreset[]).filter(
  (preset): preset is Exclude<PeriodPreset, 'custom'> => preset !== 'custom',
);

const COMPARISON_KEYS: Record<ComparisonMode, StringKey> = {
  none: 'context.comparison.none',
  previous: 'context.comparison.previous',
  sameLastYear: 'context.comparison.sameLastYear',
};

const UNCATEGORISED_VALUE = '\u0000uncategorised';

function toValue(entry: CategorySelectionEntry): string {
  return entry === null ? UNCATEGORISED_VALUE : entry;
}

function fromValue(value: string): CategorySelectionEntry {
  return value === UNCATEGORISED_VALUE ? null : value;
}

export interface ContextBarProps {
  snapshot: AyqAnalyticalSnapshot;
  context: AnalysisContext;
  result: AnalysisResult;
  anchor: IsoDate;
  onChange(context: AnalysisContext): void;
}

export function ContextBar({ snapshot, context, result, anchor, onChange }: ContextBarProps): JSX.Element {
  const t = useText();
  const locale = useLocale();

  const accountsLabel =
    context.accountKeys.length === snapshot.accounts.length
      ? t('context.accounts.all')
      : t('context.accounts.some', { n: context.accountKeys.length, m: snapshot.accounts.length });

  const categoryEntries = [...snapshot.categories.map(category => category.categoryId), null];
  const categoryLabel =
    context.categoryKeys.length === categoryEntries.length
      ? t('context.category.all')
      : t('context.category.some', { n: context.categoryKeys.length, m: categoryEntries.length });

  const applyPreset = (preset: Exclude<PeriodPreset, 'custom'>): void => {
    const period = resolvePreset(preset, anchor);
    onChange({ ...context, fromDate: period.fromDate, toDate: period.toDate });
  };

  // The trigger names the preset whose dates these are, or Custom… — read
  // back from the committed dates, never from how they were chosen (PC6a).
  const presetLabel = t(PRESET_KEYS[presetMatching({ fromDate: context.fromDate, toDate: context.toDate }, anchor)]);

  // The date fields edit a local draft. Keystrokes never reach the context;
  // blur or Enter commits, and a committed date that crosses the other bound
  // moves that bound with it. An empty or invalid draft restores the last
  // committed value (PC6c).
  const [fromDraft, setFromDraft] = useState(context.fromDate);
  const [toDraft, setToDraft] = useState(context.toDate);
  useEffect(() => {
    setFromDraft(context.fromDate);
    setToDraft(context.toDate);
  }, [context.fromDate, context.toDate]);

  const commitDate = (field: 'fromDate' | 'toDate', draft: string): void => {
    const next = commitPeriodDate(context, field, draft);
    if (next === null) {
      (field === 'fromDate' ? setFromDraft : setToDraft)(context[field]);
      return;
    }
    onChange(next);
  };

  const commitOnEnter = (field: 'fromDate' | 'toDate', draft: string) => (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') commitDate(field, draft);
  };

  const comparison = result.comparison;

  return (
    <div className="context-bar">
      <Field label={t('context.period.label')}>
        <div className="period-control">
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <Button appearance="subtle" aria-label={t('context.period.label')}>
                {presetLabel}
              </Button>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                {PRESET_CHOICES.map(preset => (
                  <MenuItem key={preset} onClick={() => applyPreset(preset)}>
                    {t(PRESET_KEYS[preset])}
                  </MenuItem>
                ))}
              </MenuList>
            </MenuPopover>
          </Menu>
          <Input
            type="date"
            value={fromDraft}
            aria-label={t('context.period.label')}
            onChange={(_event, data) => setFromDraft(data.value)}
            onBlur={() => commitDate('fromDate', fromDraft)}
            onKeyDown={commitOnEnter('fromDate', fromDraft)}
          />
          <Input
            type="date"
            value={toDraft}
            aria-label={t('context.period.label')}
            onChange={(_event, data) => setToDraft(data.value)}
            onBlur={() => commitDate('toDate', toDraft)}
            onKeyDown={commitOnEnter('toDate', toDraft)}
          />
        </div>
      </Field>

      <Field label={t('context.comparison.label')}>
        <Dropdown
          aria-label={t('context.comparison.label')}
          selectedOptions={[context.comparison]}
          value={t(COMPARISON_KEYS[context.comparison])}
          onOptionSelect={(_event, data) =>
            onChange({ ...context, comparison: (data.optionValue ?? 'none') as ComparisonMode })
          }
        >
          {(Object.keys(COMPARISON_KEYS) as ComparisonMode[]).map(mode => (
            <Option key={mode} value={mode} text={t(COMPARISON_KEYS[mode])}>
              {t(COMPARISON_KEYS[mode])}
            </Option>
          ))}
        </Dropdown>
        {comparison !== null && (
          <span className="secondary">
            {t('context.comparison.dates', {
              from: formatDate(comparison.fromDate, locale),
              to: formatDate(comparison.toDate, locale),
            })}
          </span>
        )}
        {comparison?.clamped != null && (
          <span className="secondary">
            {t('context.comparison.clamped', {
              year: comparison.clamped.year,
              date: formatDate(comparison.clamped.clampedDate, locale),
            })}
          </span>
        )}
      </Field>

      <Field label={t('context.accounts.label')}>
        <Dropdown
          multiselect
          aria-label={t('context.accounts.label')}
          value={accountsLabel}
          selectedOptions={[...context.accountKeys]}
          onOptionSelect={(_event, data) => {
            const keys = data.selectedOptions;
            // An analysis needs a scope: the last account stays selected.
            if (keys.length === 0) return;
            onChange({ ...context, accountKeys: keys });
          }}
        >
          {snapshot.accounts.map(account => {
            // The identifier is masked at the source (03 §13.8): the country
            // code, the ellipsis and the final four, never more.
            const label = t('context.accounts.entry', { name: account.name, identifier: account.displayIdentifier });
            return (
              <Option key={account.accountKey} value={account.accountKey} text={label}>
                {label}
              </Option>
            );
          })}
        </Dropdown>
      </Field>

      <Field label={t('context.category.label')}>
        <Dropdown
          multiselect
          aria-label={t('context.category.label')}
          value={categoryLabel}
          selectedOptions={context.categoryKeys.map(toValue)}
          onOptionSelect={(_event, data) =>
            onChange({ ...context, categoryKeys: data.selectedOptions.map(fromValue) })
          }
        >
          {snapshot.categories.map(category => (
            <Option key={category.categoryId} value={category.categoryId} text={category.name}>
              {category.name}
            </Option>
          ))}
          <Option value={UNCATEGORISED_VALUE} text={t('context.category.uncategorised')}>
            {t('context.category.uncategorised')}
          </Option>
        </Dropdown>
      </Field>

      <div className="context-static">
        <span>{t('context.metric')}</span>
        <span>{t('context.dimension')}</span>
      </div>

      <div className="context-coverage">
        <CoverageIndicator result={result} />
      </div>
    </div>
  );
}
