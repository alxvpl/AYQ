import type { JSX } from 'react';
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
import { isIsoDate, resolvePreset, type PeriodPreset } from '../dates.js';
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

const PRESET_KEYS: Record<Exclude<PeriodPreset, 'custom'>, StringKey> = {
  thisMonth: 'context.period.preset.thisMonth',
  lastMonth: 'context.period.preset.lastMonth',
  thisQuarter: 'context.period.preset.thisQuarter',
  lastQuarter: 'context.period.preset.lastQuarter',
  thisYear: 'context.period.preset.thisYear',
  lastYear: 'context.period.preset.lastYear',
};

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

  const setDate = (field: 'fromDate' | 'toDate', value: string): void => {
    if (!isIsoDate(value)) return;
    const next = { ...context, [field]: value } as AnalysisContext;
    if (next.fromDate > next.toDate) return;
    onChange(next);
  };

  const comparison = result.comparison;

  return (
    <div className="context-bar">
      <Field label={t('context.period.label')}>
        <div className="period-control">
          <span className="period-range">
            {t('context.period.range', {
              from: formatDate(context.fromDate, locale),
              to: formatDate(context.toDate, locale),
            })}
          </span>
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <Button appearance="subtle" aria-label={t('context.period.label')}>
                {t('context.period.preset.custom')}
              </Button>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                {(Object.keys(PRESET_KEYS) as Array<Exclude<PeriodPreset, 'custom'>>).map(preset => (
                  <MenuItem key={preset} onClick={() => applyPreset(preset)}>
                    {t(PRESET_KEYS[preset])}
                  </MenuItem>
                ))}
              </MenuList>
            </MenuPopover>
          </Menu>
          <Input
            type="date"
            value={context.fromDate}
            aria-label={t('context.period.label')}
            onChange={(_event, data) => setDate('fromDate', data.value)}
          />
          <Input
            type="date"
            value={context.toDate}
            aria-label={t('context.period.label')}
            onChange={(_event, data) => setDate('toDate', data.value)}
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
            const label = account.displayIdentifier === null
              ? account.name
              : `${account.name} · ${account.displayIdentifier}`;
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
