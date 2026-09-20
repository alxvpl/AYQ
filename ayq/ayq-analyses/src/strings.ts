// AYQ Analyses — A1 string catalogue.
//
// One catalogue, `src/strings/en.json`. No user-facing literal lives in a
// component, accessible names included: an accessible name reuses the key of
// the visible label it describes. A missing key is a defect, so it throws
// rather than rendering a blank (r03 §11, 04 A24).

import catalogue from './strings/en.json' with { type: 'json' };

export type StringKey = keyof typeof catalogue;

type PluralForms = { one: string; other: string };
type CatalogueEntry = string | PluralForms;

export type StringParams = Record<string, string | number>;

const entries = catalogue as unknown as Record<string, CatalogueEntry>;

function isPlural(entry: CatalogueEntry): entry is PluralForms {
  return typeof entry !== 'string';
}

function interpolate(template: string, params: StringParams | undefined, key: string): string {
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = params?.[name];
    if (value === undefined) throw new Error(`string ${key} is missing the value ${name}`);
    return String(value);
  });
}

/**
 * The one way text reaches the screen. `params.n` selects the plural form, so
 * the interface never reads "1 transactions".
 */
export function translate(key: StringKey, params?: StringParams, locale = 'en'): string {
  const entry = entries[key as string];
  if (entry === undefined) throw new Error(`string ${String(key)} is not in the catalogue`);
  if (!isPlural(entry)) return interpolate(entry, params, String(key));
  const count = params?.n;
  if (typeof count !== 'number') throw new Error(`string ${String(key)} needs a count`);
  const form = new Intl.PluralRules(locale).select(count);
  return interpolate(form === 'one' ? entry.one : entry.other, params, String(key));
}

export function hasString(key: string): key is StringKey {
  return Object.prototype.hasOwnProperty.call(entries, key);
}

export function catalogueKeys(): string[] {
  return Object.keys(entries);
}
