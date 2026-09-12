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
  'import.history.none': 'Nothing has been imported yet.',
  'import.column.at': 'Read',
  'import.column.file': 'File',
  'import.column.account': 'Account',
  'import.column.records': 'Records',
  'import.column.imported': 'Imported',
  'import.column.duplicates': 'Already held',
  'import.column.outcome': 'And then',
  'import.outcome.categorised': '{count} filed by a rule',
  'import.outcome.matched': '{count} matched to what was expected',
  'import.outcome.waiting': '{count} matches waiting on you',
  'import.outcome.failed': '{count} could not be read',
  'import.outcome.nothing': 'nothing else',
  'import.files': '{count} files',

  'notBuilt.title': 'Not built yet',
  'notBuilt.reports':
    'Reports begin with spending by category and period. The screen is empty ' +
    'because that view has not been built, not because your data is ' +
    'insufficient.',

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

  'today.funds': 'Available funds',
  'today.funds.counted': '{counted} of {total} accounts counted',
  'today.coverage.to':
    'Reliable to {date} — the earliest date the counted accounts’ statements ' +
    'reach.',
  'today.coverage.unknown':
    'One of the counted accounts has no statement, so there is no date this ' +
    'position can be relied on to.',
  'today.coverage.nothing':
    'Nothing has been imported yet, so there is nothing to be reliable to.',
  'today.lasts': 'How long it lasts',
  'today.lowest': 'Lowest point',
  'today.lowest.on': 'on {date}',
  'today.monthEnd': 'Expected at the end of {month}',
  'today.monthEnd.note': 'after everything planned and expected',
  'today.noForecast':
    'Nothing is planned or expected yet, so there is no position to project.',
  'today.waiting': 'Waiting on you',
  'today.waiting.overdue': 'overdue, {amount}',
  'today.waiting.matches': 'matches to confirm',
  'today.waiting.uncategorised': 'transactions with no category',
  'today.waiting.suggestions': 'suggested records to confirm',
  'today.waiting.counterparties': 'counterparties with nothing filed',
  'today.waiting.none': 'Nothing is waiting on you.',
  'today.movements': 'Latest movements',
  'today.movements.all': 'all accounts',
  'today.movements.none': 'Nothing has been imported yet.',
  'today.open.upcoming': 'Open Upcoming',
  'today.open.review': 'Open Review',
  'today.open.register': 'Open Register',
  'today.open.accounts': 'See accounts',
  'today.open.import': 'Import statements',

  // Review (04 A6): transitional by design, and it has to shrink.
  'review.title': 'Review',
  'review.blurb':
    'Who these payments are, and where they belong. This queue shrinks as rules ' +
    'and names accumulate — it is not a list AYQ expects you to keep working ' +
    'through for ever.',
  'review.backlog': 'Nothing filed yet',
  'review.backlog.note':
    'Counterparties AYQ has resolved and nobody has filed, the largest first.',
  'review.backlog.none':
    'Everything AYQ has resolved has been filed. Nothing is waiting here.',
  'review.column.name': 'Counterparty',
  'review.column.transactions': 'Transactions',
  'review.column.spent': 'Out',
  'review.column.seen': 'Seen',
  'review.seen': '{first} to {last}',
  'review.shrinking': '{filed} of {total} filed',

  // The pane: who they are, and the two decisions.
  'review.pane.none': 'Choose a counterparty to see what is behind it.',
  'review.pane.evidence': 'What the bank printed',
  'review.pane.evidence.note':
    'The names these transactions arrived under. AYQ decided they are one ' +
    'counterparty; if one of them is not, say so here.',
  'review.pane.byHand': 'By hand',
  'review.pane.byStatement': 'By the statement',
  'review.pane.moveTo': 'This one is really',
  'review.pane.moveTo.none': 'Leave it here',
  'review.pane.recent': 'Recent transactions',
  'review.pane.rhythm': 'Comes back {cadence}, about {amount}',
  'review.pane.file': 'Where these belong',
  'review.pane.file.note':
    'Filing these is a statement about the transactions below. Learning a rule ' +
    'is a statement about every one that arrives from now on — two decisions, ' +
    'and AYQ will not make the second one for you (03 §4.1).',
  'review.do.category': 'Category',
  'review.do.file': 'File these',
  'review.do.learn': 'File these and remember',
  'review.filed': '{count} filed.',
  'review.filed.kept':
    '{count} filed. {kept} left as they were, because you had filed them ' +
    'yourself into something else.',
  'review.learned': '{count} filed, and AYQ will file this counterparty from now on.',
  'review.moved': '{count} transactions now belong to {name}.',
  'review.needsCategory': 'Choose a category first.',

  // Settings → Categories: the only place a category is made or renamed.
  'categories.title': 'Categories',
  'categories.blurb':
    'The only place categories are made or renamed. They are the budget’s own, ' +
    'and every other screen reads them from here.',
  'categories.column.name': 'Category',
  'categories.column.group': 'Group',
  'categories.column.kind': 'Kind',
  'categories.kind.income': 'Money in',
  'categories.kind.expense': 'Money out',
  'categories.rename': 'Rename',
  'categories.rename.save': 'Save the name',
  'categories.rename.cancel': 'Cancel',
  'categories.new': 'New category',
  'categories.new.name': 'What to call it',
  'categories.new.group': 'In which group',
  'categories.new.save': 'Add it',
  'categories.consequence':
    'A rule keeps a category by name, not by number, so that it outlives a ' +
    'budget (03 §4.2). Renaming a category moves its rules with it; the rules ' +
    'are on the Rules tab.',
  'categories.noArchive':
    'AYQ does not archive or delete a category here. Nothing in Canon says what ' +
    'should happen to the transactions filed under one, and guessing is worse ' +
    'than not offering it.',
  'categories.empty': 'This budget has no categories yet.',
  'categories.needsName': 'A category needs a name.',
  'categories.made': '{name} added.',
  'categories.renamed': '{was} is now {name}.',

  // Settings → Rules: what will happen from now on (04 A7).
  'rules.title': 'Rules',
  'rules.blurb':
    'What AYQ will file by itself from now on. Every rule is keyed on a ' +
    'counterparty, is visible here, and can be taken away.',
  'rules.column.counterparty': 'Counterparty',
  'rules.column.category': 'Files into',
  'rules.column.since': 'Learned',
  'rules.column.remove': 'Forget',
  'rules.remove': 'Forget this rule',
  'rules.apply': 'Apply the rules now',
  'rules.applied': '{count} transactions filed.',
  'rules.removed': 'That rule is gone. What it filed stays where it is.',
  'rules.empty':
    'AYQ has learned no rules yet. It learns one when you ask it to remember a ' +
    'counterparty, on Review or in the Register.',
  'rules.missingCategory':
    'This rule names a category this budget does not have, so it files nothing.',

  // Upcoming (03 §7.2): what is coming, and what it does to the position.
  'upcoming.title': 'Upcoming',
  'upcoming.blurb':
    'What is expected between now and {horizon}, and where the position stands ' +
    'after each of them.',
  'upcoming.column.date': 'Date',
  'upcoming.column.name': 'What',
  'upcoming.column.category': 'Category',
  'upcoming.column.amount': 'Amount',
  'upcoming.column.balance': 'Position after',
  'upcoming.column.state': 'State',
  'upcoming.state.expected': 'Expected',
  'upcoming.state.overdue': 'Overdue, still counted',
  'upcoming.state.suggested': 'Suggested',
  'upcoming.state.plan': 'Rest of the plan',
  'upcoming.state.dismissed': 'Dismissed',
  'upcoming.notCounted': 'not counted',
  'upcoming.empty': 'Nothing is expected yet.',
  'upcoming.lowest': 'Lowest point {amount} on {date}',
  'upcoming.new': 'New planned payment',
  'upcoming.match': 'Check what has already happened',
  'upcoming.suggest': 'Find what keeps coming back',

  // What is waiting on a person, and never applied for them (03 §7.16).
  'upcoming.matches': 'Matches to confirm',
  'upcoming.matches.note':
    'AYQ is not sure enough about these to decide them for you.',
  'upcoming.matches.expected': 'Expected',
  'upcoming.matches.happened': 'What happened',
  'upcoming.matches.evidence': 'What they have in common',
  'upcoming.matches.apart': '{days} days apart',
  'upcoming.matches.yes': 'The same payment',
  'upcoming.matches.no': 'Not this one',

  // The pane. Every action says what it reaches (03 §7.17).
  'upcoming.pane.occurrence': 'This occurrence',
  'upcoming.pane.record': 'The record it comes from',
  'upcoming.pane.none': 'Choose a row to see what is behind it.',
  'upcoming.pane.planOnly':
    'This is the part of {category}’s plan for the month that no record ' +
    'accounts for (03 §7.11). It is not a record, so there is nothing here to ' +
    'act on — change the plan on the Plan screen.',
  'upcoming.pane.planOnlyNoCategory':
    'This is the part of the month’s plan that no record accounts for. It is ' +
    'not a record, so there is nothing here to act on.',
  'upcoming.pane.due': 'Due {date}',
  'upcoming.pane.moved': 'Moved from {date}',
  'upcoming.pane.every': 'Every {frequency}',
  'upcoming.pane.once': 'Once, on {date}',
  'upcoming.pane.onceNote':
    'A single payment. It has a date, not a rhythm, so nothing here reaches ' +
    'beyond this one occurrence (03 §7.17).',
  'upcoming.pane.overdueNote':
    'Its date has passed with nothing matched to it. It still counts, as due ' +
    'today, until you match, reschedule or dismiss it (03 §7.13).',
  'upcoming.pane.suggestedNote':
    'AYQ noticed this rhythm. It is an offer, not a decision, and it is ' +
    'counted as a suggestion until you accept it (03 §7.7, §7.12).',
  'upcoming.pane.matched': 'Matched to {payee} on {date}',
  'upcoming.pane.matchedBy.manual': 'matched by you',
  'upcoming.pane.matchedBy.automatic': 'matched by AYQ',
  'upcoming.pane.confirmedAt': 'Confirmed {date}, and expected from then on',
  'upcoming.pane.suggestedAt': 'Suggested {date}, and counted from then on',
  'upcoming.pane.ends': 'Ends {date}',
  'upcoming.pane.endsNever': 'No end date',

  'upcoming.do.reschedule': 'Move this one',
  'upcoming.do.rescheduleTo': 'Move to',
  'upcoming.do.dismiss': 'Dismiss this one',
  'upcoming.do.undismiss': 'Expect this one again',
  'upcoming.do.unmatch': 'Not the same payment after all',
  'upcoming.do.edit': 'Edit the record',
  'upcoming.do.accept': 'Accept the record',
  'upcoming.do.putAway': 'Put the record away',
  'upcoming.do.endSeries': 'End the series',
  'upcoming.do.endSeriesOn': 'Last date',
  'upcoming.do.remove': 'Remove the record',
  'upcoming.do.scope.occurrence': 'this occurrence only',
  'upcoming.do.scope.record': 'the whole record',

  // The one editor. Both a new record and an existing one are written here.
  'upcoming.form.new': 'A new planned payment',
  'upcoming.form.edit': 'Editing {name}',
  'upcoming.form.name': 'What it is',
  'upcoming.form.kind': 'Direction',
  'upcoming.form.kind.expense': 'Money out',
  'upcoming.form.kind.income': 'Money in',
  'upcoming.form.amount': 'Amount',
  'upcoming.form.category': 'Category',
  'upcoming.form.category.none': 'No category',
  'upcoming.form.start': 'First date',
  'upcoming.form.frequency': 'How often',
  'upcoming.form.interval': 'Every how many',
  'upcoming.form.end': 'Last date, if it has one',
  'upcoming.form.save': 'Save the record',
  'upcoming.form.cancel': 'Cancel',
  'upcoming.form.needsName': 'A record needs a name.',
  'upcoming.form.needsAmount': 'A record needs an amount above zero.',
  'upcoming.form.needsDate': 'A record needs a first date.',

  'frequency.once': 'once',
  'frequency.weekly': 'week',
  'frequency.fortnightly': 'fortnight',
  'frequency.monthly': 'month',
  'frequency.quarterly': 'quarter',
  'frequency.half-yearly': 'six months',
  'frequency.yearly': 'year',

  // Plan (03 §7.8, §7.10): categories down, one month across.
  'plan.title': 'Plan',
  'plan.blurb':
    'What each category is planned to take this month, what it has taken, and ' +
    'what AYQ still expects before the month is out.',
  'plan.month': 'Month',
  'plan.column.category': 'Category',
  'plan.column.plan': 'Planned',
  'plan.column.actual': 'Actual',
  'plan.column.remaining': 'Left',
  'plan.column.expected': 'Still expected',
  'plan.total': 'All categories',
  'plan.notEditable':
    'This month is outside the range the budget can be planned in, so it can ' +
    'be read and not changed.',
  'plan.expectedNote':
    'Still expected is the larger of what is left of the plan and the records ' +
    'expected in the category — never their sum (03 §7.10).',
  'plan.empty': 'This budget has no categories yet.',

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
