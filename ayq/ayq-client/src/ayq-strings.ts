// Every word the interface says, and every way it formats a value.
//
// 04 A24: the interface ships in English and Dutch is a planned addition, so
// no user-facing string is written into a component. Adding Dutch is adding a
// catalogue here and nothing else — no component is touched, and the number,
// date and list formats move with the words because the catalogue names its
// own locale.
//
// `ayq-strings.test.ts` holds the other half of A24: no component file carries
// a user-facing string literal. A key that is missing from a catalogue is a
// typecheck failure, not a blank on screen.

/** A catalogue's locale, which decides how it formats as well as what it says. */
export type AyqLocaleTag = 'en-GB';

/**
 * English, as shipped.
 *
 * Keys are `screen.thing`, and read as what they are rather than as what they
 * say: renaming a label must not mean renaming a key everywhere it is used.
 */
const EN = {
  'app.name': 'AYQ',

  'ground.light': 'Light',
  'ground.dark': 'Dark',
  'ground.system': 'Follow the system',

  'appearance.title': 'Appearance',
  'appearance.blurb':
    'How AYQ looks. The ground is yours to choose and is remembered; the ' +
    'accent and the state colours are the product’s and are not.',
  'appearance.ground.heading': 'Ground',
  'appearance.ground.hint':
    'Applied as you choose it, and kept for the next time AYQ opens.',
  'appearance.ground.following': 'Following the system, which is currently {ground}.',
  'appearance.accent.heading': 'Accent',
  'appearance.accent.note':
    'Electric Mint. It marks where you are and what you have selected. It ' +
    'never carries a state meaning, and a state colour is never the accent.',
  'appearance.states.heading': 'States',
  'appearance.figures.heading': 'Figures',
  'appearance.figures.note':
    'The interface typeface with tabular numerals, right-aligned, the minus ' +
    'sign carrying direction. A negative amount is not coloured, which leaves ' +
    'red to mean one thing only: something is wrong.',
  'appearance.buttons.heading': 'Buttons',
  'appearance.buttons.note':
    'One treatment for a filled button everywhere: dark, with mint text.',
  'appearance.buttons.primary': 'Filled',
  'appearance.buttons.secondary': 'Plain',
  'appearance.saving': 'Saving…',
  'appearance.failed': 'The ground could not be saved: {reason}',

  'state.confirmed': 'Confirmed',
  'state.suggested': 'Suggested',
  'state.overdue': 'Overdue',
  'state.neutral': 'Neutral',
  'state.uncategorised': 'Uncategorised',

  'sample.figure.label': 'Available funds',
  'sample.figure.note': 'Sample values. Nothing here is anybody’s money.',
} as const;

export type AyqStringKey = keyof typeof EN;

type AyqCatalogue = {
  readonly locale: AyqLocaleTag;
  readonly strings: Readonly<Record<AyqStringKey, string>>;
};

const CATALOGUES: Readonly<Record<AyqLocaleTag, AyqCatalogue>> = {
  'en-GB': { locale: 'en-GB', strings: EN },
};

/**
 * The catalogue in force.
 *
 * English ships (A24). Dutch arrives as a second entry above and a different
 * value here; the set of languages stays the owner's to extend.
 */
export const AYQ_LOCALE: AyqLocaleTag = 'en-GB';

/** Every catalogue there is, so a test can check they agree on their keys. */
export function ayqCatalogues(): AyqCatalogue[] {
  return Object.values(CATALOGUES);
}

export type AyqTextValues = Readonly<Record<string, string | number>>;

/**
 * What the interface says, for one key.
 *
 * `{name}` in a string is replaced from `values`. A placeholder with nothing
 * to fill it is left as it stands rather than quietly becoming "undefined":
 * the fault is then visible on the screen where it can be fixed.
 */
export function ayqText(key: AyqStringKey, values?: AyqTextValues): string {
  const template = CATALOGUES[AYQ_LOCALE].strings[key];
  if (values === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = values[name];
    return value === undefined ? whole : String(value);
  });
}

/* ------------------------------------------------------------- formatting */

const MONEY = new Intl.NumberFormat(AYQ_LOCALE, {
  style: 'currency',
  currency: 'EUR',
});

const AMOUNT = new Intl.NumberFormat(AYQ_LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const WHOLE = new Intl.NumberFormat(AYQ_LOCALE);

const DAY = new Intl.DateTimeFormat(AYQ_LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const DAY_NO_YEAR = new Intl.DateTimeFormat(AYQ_LOCALE, {
  day: 'numeric',
  month: 'long',
});

const MONTH = new Intl.DateTimeFormat(AYQ_LOCALE, {
  month: 'long',
  year: 'numeric',
});

const MOMENT = new Intl.DateTimeFormat(AYQ_LOCALE, {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const LIST = new Intl.ListFormat(AYQ_LOCALE, {
  style: 'long',
  type: 'conjunction',
});

/** Integer cents with the currency symbol. */
export function ayqMoney(cents: number): string {
  return MONEY.format(cents / 100);
}

/**
 * Integer cents without the symbol, for a column of figures (04 A19).
 *
 * The symbol is dropped in a table because it repeats down every row and says
 * nothing after the first; the column heading carries it.
 */
export function ayqAmount(cents: number): string {
  return AMOUNT.format(cents / 100);
}

/** A count, grouped: 50 000 rather than 50000. */
export function ayqCount(value: number): string {
  return WHOLE.format(value);
}

/** Midday UTC, so a date-only value never slips a day on either side. */
function atNoon(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`);
}

/** `2026-09-30` as the locale writes it. */
export function ayqDate(iso: string): string {
  return DAY.format(atNoon(iso));
}

/** The same without the year, for a list that is plainly inside one. */
export function ayqDateShort(iso: string): string {
  return DAY_NO_YEAR.format(atNoon(iso));
}

/** `2026-09` as the locale writes it. */
export function ayqMonthName(month: string): string {
  return MONTH.format(atNoon(`${month}-01`));
}

/** An instant, to the minute, in the reader's own zone. */
export function ayqMoment(iso: string): string {
  const when = new Date(iso);
  return Number.isNaN(when.getTime()) ? iso : MOMENT.format(when);
}

/** "a, b and c", as the locale joins them. */
export function ayqList(items: readonly string[]): string {
  return LIST.format(items);
}
