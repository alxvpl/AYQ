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

  'destination.today': 'Today',
  'destination.accounts': 'Accounts',
  'destination.register': 'Register',
  'destination.review': 'Review',
  'destination.upcoming': 'Upcoming',
  'destination.plan': 'Plan',
  'destination.reports': 'Reports',
  'destination.import': 'Import',
  'destination.settings': 'Settings',
  'destination.group.whereYouStand': 'Where you stand',
  'destination.group.whatNeedsDeciding': 'What needs deciding',
  'destination.group.seldom': 'Seldom',

  'screen.today.blurb':
    'What you have, how long it lasts, and what is waiting on you.',
  'screen.accounts.blurb':
    'What each account holds, how far its statements reach, and whether AYQ ' +
    'agrees with the bank.',
  'screen.register.blurb':
    'Every transaction AYQ holds. Uncategorised is a valid state and stays in ' +
    'the totals.',
  'screen.review.blurb':
    'What needs a decision. This queue shrinks as rules accumulate — it is not ' +
    'meant to stay long.',
  'screen.upcoming.blurb': 'What is coming, and where it leaves you.',
  'screen.plan.blurb':
    'What you intend each category to take, against what it has taken. Money ' +
    'is not assigned in advance.',
  'screen.import.blurb':
    'CAMT.053 statement files, as XML or ZIP. A ZIP is read in memory and ' +
    'never unpacked to disk.',

  'status.engine.running': 'Engine running',
  'status.engine.starting': 'Starting the engine…',
  'status.engine.failed': 'The engine did not answer',
  'status.budget': 'Budget: {name}',
  'status.transactions': '{count} transactions',
  'status.accountsCounted': '{counted} of {total} accounts counted',
  'status.lastImport': 'Last import {when}',
  'status.noImport': 'Nothing imported yet',

  'notice.retry': 'Try again',
  'notice.dismiss': 'Dismiss',

  'import.action': 'Import CAMT.053',
  'import.waiting': 'Waiting for a file…',
  'import.reading': 'Reading and importing…',
  'import.readingMany': 'Reading and importing {count} files…',
  'import.cancelled': 'No file chosen; nothing was imported.',
  'import.failed': 'The import failed. {reason}',
  'import.outcome':
    '{file}: {imported} imported, {duplicates} already there — {account}',
  'import.categorised': '{count} categorised by rules',
  'import.skipped': '{count} skipped',
  'import.problems': '{count} could not be read',
  'import.history': 'What AYQ has read',

  'notBuilt.title': 'Not built yet',
  'notBuilt.today':
    'Available funds, how long they last and what is waiting on you are not ' +
    'built yet. The Register below the rail holds every transaction AYQ has.',
  'notBuilt.accounts':
    'Balances, how far each account’s statements reach and whether AYQ agrees ' +
    'with the bank are not built yet.',
  'notBuilt.review':
    'The full Review — matches, counterparties, categories, suggestions and ' +
    'what you have rejected — is not built yet. What is here is the ' +
    'counterparties AYQ has resolved and what it knows them by.',
  'notBuilt.reports':
    'Reports begin with spending by category and period. The screen is empty ' +
    'because that view has not been built, not because your data is ' +
    'insufficient.',
  'notBuilt.settingsAccounts':
    'The switch that decides which accounts count toward available funds is ' +
    'not built yet.',
  'notBuilt.settingsCategories':
    'Creating, renaming, grouping and archiving categories is not built yet.',

  'settings.tab.accounts': 'Accounts',
  'settings.tab.categories': 'Categories',
  'settings.tab.rules': 'Rules',
  'settings.tab.appearance': 'Appearance',

  'register.search': 'Search counterparty, description or amount',
  'register.filter.period': 'Period',
  'register.filter.account': 'Account',
  'register.filter.category': 'Category',
  'register.filter.counterparty': 'Counterparty',
  'register.filter.amountFrom': 'Amount from',
  'register.filter.amountTo': 'Amount to',
  'register.filter.uncategorised': 'Uncategorised only',
  'register.filter.search': 'Search',
  'register.filter.clearAll': 'Clear all',
  'register.filter.remove': 'Remove the {filter} filter',
  'register.filter.applied': 'Showing only:',
  'register.period.thisMonth': 'This month',
  'register.period.threeMonths': 'Last 3 months',
  'register.period.thisYear': 'This year',
  'register.period.allTime': 'All time',
  'register.all.accounts': 'All accounts',
  'register.all.categories': 'All categories',
  'register.category.none': 'Uncategorised',
  'register.column.date': 'Date',
  'register.column.counterparty': 'Counterparty',
  'register.column.category': 'Category',
  'register.column.account': 'Account',
  'register.column.amount': 'Amount',
  'register.totals.filtered':
    'These totals describe the {count} transactions this filter matched, not ' +
    'everything AYQ holds. In {in} · out {out} · net {net}',
  'register.totals.all':
    'These totals describe all {count} transactions AYQ holds. ' +
    'In {in} · out {out} · net {net}',
  'register.totals.uncategorised':
    '{count} of them are uncategorised, and are counted here.',
  'register.showing': 'Showing the newest {shown} of {total}.',
  'register.showMore': 'Show more',
  'register.empty':
    'Nothing has been imported yet. A statement makes an account and fills ' +
    'this table.',
  'register.emptyFiltered': 'No transaction matches this filter.',

  'accounts.column.name': 'Account',
  'accounts.column.counts': 'In available funds',
  'accounts.column.statements': 'Statements to',
  'accounts.column.balance': 'Balance',
  'accounts.column.agrees': 'Agrees with the bank',
  'accounts.counts.yes': 'Counted',
  'accounts.counts.no': 'Not counted',
  'accounts.statements.none': 'Nothing imported',
  'accounts.agrees.yes': 'Agrees',
  'accounts.agrees.no': 'Differs by {amount}',
  'accounts.agrees.unknown': 'Nothing to compare',
  'accounts.footer.available':
    'Available funds · {counted} of {total} accounts',
  'accounts.footer.held': 'Held in total',
  'accounts.reliableTo':
    'Everything computed from these accounts is reliable to {date}: the ' +
    'earliest date the counted accounts’ statements reach.',
  'accounts.reliableUnknown':
    'One of the counted accounts has no statement at all, so there is no date ' +
    'to which the position can be relied on. Importing its statements gives ' +
    'one.',
  'accounts.empty': 'No account yet. Importing a statement makes one.',
  'accounts.detail.statement': 'The statement says',
  'accounts.detail.ledger': 'AYQ holds',
  'accounts.detail.difference': 'They differ by',
  'accounts.detail.readFrom': 'Read from',
  'accounts.detail.readAt': 'Read on',
  'accounts.detail.counts': 'Counts toward available funds',
  'accounts.detail.agrees':
    'What the statement closed at and what AYQ holds are the same figure.',
  'accounts.detail.differs':
    'The two disagree by this much. AYQ does not say which statement is ' +
    'missing, and it changes nothing in the ledger to close it: no adjustment, ' +
    'no balancing entry. The way to close it is to import what is missing.',
  'accounts.detail.nothing':
    'No statement has been imported for this account, so there is nothing to ' +
    'compare its balance with.',
  'accounts.detail.informs':
    'This informs you and gates nothing: a difference does not block import, ' +
    'matching, planning or the forecast.',

  'settings.accounts.only':
    'Only this switch lives here. Balances, how far each account’s statements ' +
    'reach and whether AYQ agrees with the bank are on the Accounts screen.',
  'settings.accounts.transfers':
    'A transfer between a counted and an uncounted account moves money in or ' +
    'out of available funds; it is never income or expense.',
  'settings.accounts.open': 'Open Accounts',

  'detail.none': 'Choose a transaction to see what is behind it.',
  'detail.bankSaid': 'What the bank said',
  'detail.counterparty': 'Counterparty',
  'detail.evidence': 'How AYQ decided who this is',
  'detail.evidence.resolvedBy': 'Read from',
  'detail.evidence.kind': 'Kind of payment',
  'detail.evidence.iban': 'Counterparty IBAN',
  'detail.evidence.mandate': 'SEPA mandate',
  'detail.evidence.endToEnd': 'End-to-end reference',
  'detail.evidence.code': 'Bank transaction code',
  'detail.evidence.intermediary': 'Through',
  'detail.evidence.file': 'From the statement',
  'detail.evidence.importedName': 'Printed by the bank as',
  'detail.evidence.none':
    'This transaction came from before AYQ kept evidence, so there is none to ' +
    'show.',
  'detail.category': 'Category',
  'detail.category.none': 'Uncategorised',
  'detail.by.rule': 'by rule',
  'detail.by.you': 'by you',
  'detail.by.nobody': 'nobody has decided yet',
  'detail.match': 'Matched to',
  'detail.match.none': 'Not matched to an expected payment.',
  'detail.match.due': 'due {date}',
  'detail.match.automatic': 'matched by AYQ',
  'detail.match.manual': 'matched by you',
  'detail.history': 'Decisions',
  'detail.history.none': 'Nothing has been decided about this one yet.',
  'detail.history.line': '{category} — {by}, {when}',
  'detail.history.cleared': 'the category was cleared',
  'detail.action.changeCategory': 'Change category…',
  'detail.action.correctCounterparty': 'Correct counterparty…',
  'detail.action.showTheRule': 'Show the rule',
  'detail.counterparty.choose': 'Choose the counterparty this really is…',
  'detail.rule.none': 'No rule files this counterparty.',
  'detail.rule.stands': 'A rule files {counterparty} in {category}.',

  'common.loading': 'Reading…',
  'common.failed': 'The budget could not be read.',

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
