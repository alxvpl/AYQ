// AYQ Analyses — the string catalogue.
//
// One catalogue, `src/strings/en.json`. No user-facing literal lives in a
// component, accessible names included: an accessible name reuses the key of
// the visible label it describes. A missing key is a defect, so it throws
// rather than rendering a blank (r03 §11, 04 A24).
//
// Three shapes of entry (DESIGN_SYSTEM r002 §10):
// - a plain string;
// - `{ one, other }`, selected by `params.n` (§10.1) — or, for a sentence
//   whose grammar agrees with an interpolated list rather than a printed
//   number, by the number of items in that list (§10.3);
// - `{ counts: [...names], forms: { 'one|other': … } }`, one form per
//   combination of plural categories when a sentence prints more than one
//   count (§11.4).

import catalogue from './strings/en.json' with { type: 'json' };

export type StringKey = keyof typeof catalogue;

type PluralForms = { one: string; other: string };
type MultiCountForms = { counts: string[]; forms: Record<string, string> };
type CatalogueEntry = string | PluralForms | MultiCountForms;

export type StringParams = Record<string, string | number>;

const entries = catalogue as unknown as Record<string, CatalogueEntry>;

function isMultiCount(entry: CatalogueEntry): entry is MultiCountForms {
  return typeof entry !== 'string' && 'counts' in entry;
}

function isPlural(entry: CatalogueEntry): entry is PluralForms {
  return typeof entry !== 'string' && 'one' in entry;
}

function interpolate(template: string, params: StringParams | undefined, key: string): string {
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = params?.[name];
    if (value === undefined) throw new Error(`string ${key} is missing the value ${name}`);
    return String(value);
  });
}

function countOf(params: StringParams | undefined, name: string, key: string): number {
  const count = params?.[name];
  if (typeof count !== 'number') throw new Error(`string ${key} needs the count ${name}`);
  return count;
}

/**
 * The one way text reaches the screen. `params.n` selects the plural form, so
 * the interface never reads "1 transactions" — and never "one account reach".
 */
export function translate(key: StringKey, params?: StringParams, locale = 'en'): string {
  const entry = entries[key as string];
  if (entry === undefined) throw new Error(`string ${String(key)} is not in the catalogue`);
  if (typeof entry === 'string') return interpolate(entry, params, String(key));
  const rules = new Intl.PluralRules(locale);
  if (isMultiCount(entry)) {
    const category = entry.counts.map(name => rules.select(countOf(params, name, String(key)))).join('|');
    const form = entry.forms[category];
    if (form === undefined) throw new Error(`string ${String(key)} has no form for ${category}`);
    return interpolate(form, params, String(key));
  }
  if (!isPlural(entry)) throw new Error(`string ${String(key)} has an unknown shape`);
  const form = rules.select(countOf(params, 'n', String(key)));
  return interpolate(form === 'one' ? entry.one : entry.other, params, String(key));
}

export function hasString(key: string): key is StringKey {
  return Object.prototype.hasOwnProperty.call(entries, key);
}

export function catalogueKeys(): string[] {
  return Object.keys(entries);
}
