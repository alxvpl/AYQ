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
  'destination.counterparty': 'Counterparty',
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
  'import.history': 'Import history',
  'import.history.note': 'Newest first',
  'import.freshness': 'Import freshness by account',
  'import.column.anchor': 'Balance anchor',
  'import.coverage.through': 'Complete through {date}',
  'import.anchor.none': 'None',
  'import.anchor.missing': '{account} has no balance anchor',
  'import.anchor.missing.note':
    'The import succeeded and the movements are held, but the balance stays ' +
    'Unknown until you set it. Net imported movements are not shown as a balance.',
  'import.history.none': 'Nothing has been imported yet.',
  'import.column.at': 'Date',
  'import.column.file': 'File',
  'import.column.account': 'Account',
  'import.column.records': 'Records read',
  'import.column.imported': 'New',
  'import.column.duplicates': 'Already held',
  'import.column.outcome': 'And then',
  'import.outcome.categorised': '{count} filed by a rule',
  'import.outcome.matched': '{count} matched to what was expected',
  'import.outcome.waiting': '{count} matches waiting on you',
  'import.outcome.failed': '{count} could not be read',
  'import.outcome.nothing': 'nothing else',
  'import.files': '{count} files',

  'store.damaged':
    'AYQ could not read what it had kept beside this budget, so its rules and ' +
    'the record of where each name came from are gone. Your transactions are ' +
    'untouched. The unreadable file was kept as {file}.',

  'notBuilt.title': 'Not built yet',

  // Reports (04 A2, A20, A32): what was spent, by category, over a period.
  'reports.title': 'Reports',
  'reports.magnitudes': 'Spent and Expenses are magnitudes.',
  'reports.income': 'Income',
  'reports.expenses': 'Expenses',
  'reports.net': 'Net',
  'reports.byCategory': 'Spending by category',
  'reports.period': '{from} to {to}',
  'reports.select': 'Select a category to open the Register with that filter applied.',
  'reports.column.category': 'Category',
  'reports.column.spent': 'Spent',
  'reports.column.share': '% of total',
  'reports.column.average': 'Monthly average',
  'reports.column.transactions': 'Transactions',
  'reports.empty': 'Nothing was spent in this period.',
  'reports.transfers':
    '{count} transfers between your own accounts are left out: they move money, ' +
    'they do not spend it.',
  'register.filter.dates': 'Dates',
  'register.filter.dates.from': 'from {from}',
  'register.filter.dates.to': 'to {to}',

  'settings.accounts.blurb':
    'Configuration only. Balances, coverage and reconciliation live in account details.',
  'settings.categories.blurb':
    'Removing a category never destroys or reclassifies records on its own.',
  'settings.about.blurb': 'Product and build identity live here, not in ordinary chrome.',
  'settings.tab.accounts': 'Accounts',
  'settings.tab.categories': 'Categories',
  'settings.tab.rules': 'Rules',
  'settings.tab.appearance': 'Appearance',
  'settings.tab.about': 'About',
  'settings.tab.backup': 'Data & Backup',

  'attention.title': 'Needs attention',
  'attention.none': 'Nothing needs attention.',
  'attention.state': 'Attention',
  'attention.due-today': 'Expected payments due today',
  'attention.overdue': 'Expected payments overdue',
  'attention.overdue.note': '{amount} still counted',
  'attention.reconciliation-difference':
    "Accounts where the bank's balance and AYQ's differ",
  'attention.balance-unknown': 'Accounts with no known balance',
  'attention.import-failed': 'Files an import could not use',
  'attention.backup-failed': 'The last backup failed',
  'attention.backup-failed.note': '{when}: {why}',
  'attention.review': 'Counterparties to review',
  'attention.open.upcoming': 'Open Upcoming',
  'attention.open.review': 'Open Review',
  'attention.open.import': 'Open Import history',
  'attention.open.backup': 'Open Data & Backup',
  'attention.setBalance': 'Set balance: {account}',
  'attention.openAccount': 'Open {account}',
  'import.problems.title': 'Files that could not be used',
  'import.problems.handle': 'Mark as handled',
  'import.problems.handled': 'Handled {when}',

  // What the engine reports as codes, worded (04 A24; ayq-reasons.ts).
  'reason.filing.bank-charge': "the bank's own charge",
  'reason.filing.bank-interest': 'interest charged by the bank',
  'reason.filing.counterparty': 'the counterparty is {counterparty}',
  'reason.filing.legacy': 'a reason recorded by an earlier version of AYQ',
  'reason.import.line': '{file} — {why}',
  'reason.import.gone': 'it is no longer there',
  'reason.import.not-allowed': 'AYQ is not allowed to read it',
  'reason.import.folder': 'it is a folder, not a file',
  'reason.import.unreadable': 'it could not be read',
  'reason.import.no-entries': 'it holds no CAMT.053 entries',
  'reason.import.not-camt': 'it is not a CAMT.053 document',
  'reason.import.legacy': 'an earlier version of AYQ could not use it',
  'reason.resolvedBy.bank-transaction-code': "the bank's own transaction code",
  'reason.resolvedBy.structured': "the bank's structured counterparty fields",
  'reason.resolvedBy.intermediary': "a payment provider's account",
  'reason.resolvedBy.description': 'the description on the statement',
  'reason.resolvedBy.alias': 'your decision that these are one counterparty',
  'reason.resolvedBy.unresolved': 'nothing on the statement identified it',
  'reason.resolvedBy.other': 'a way this version of AYQ does not describe',
  'reason.kind.card-terminal': 'Card payment',
  'reason.kind.card-withdrawal': 'Cash withdrawal',
  'reason.kind.direct-debit': 'Direct debit',
  'reason.kind.credit-transfer': 'Transfer',
  'reason.kind.bank-fee': 'Bank fee',
  'reason.kind.interest': 'Interest',
  'reason.kind.reversal': 'Reversal',
  'reason.kind.unknown': 'Not stated by the bank',
  'reason.kind.other': 'A kind this version of AYQ does not describe',
  'reason.match.same-counterparty': 'the same counterparty',
  'reason.match.same-mandate': 'the same SEPA mandate',
  'reason.match.same-amount': 'the same amount',
  'reason.match.amount-within-tenth': 'an amount within a tenth of it',

  'error.unexpected': 'AYQ could not do that.',
  'error.engine-stopped':
    "AYQ's engine stopped. Close the window and open AYQ again.",
  'error.engine-timeout': "AYQ's engine did not answer within {minutes} minutes.",
  'error.engine-not-running':
    "AYQ's engine is not running. Close the window and open AYQ again.",
  'error.engine-native-binding':
    'AYQ could not load the part that reads the budget. This installation is ' +
    'incomplete; install AYQ again.',
  'error.picker-failed': 'The file picker could not be opened.',
  'error.store-newer':
    "This budget's AYQ records were written by a newer AYQ (version {found}; " +
    'this AYQ reads up to version {known}). Open it with that AYQ rather than ' +
    'overwrite them.',
  'error.store-copy-failed':
    "AYQ has to bring its records from version {found} to {known} and could " +
    'not first keep a copy of them. Nothing has been changed. Make sure the ' +
    'budget folder can be written to, and open AYQ again.',
  'error.budget-slow':
    'The budget did not confirm the change in time. Try again.',
  'error.import-no-file': 'No file was chosen.',
  'error.import-nothing-readable': 'Nothing was imported: {problems}.',
  'error.import-nothing-readable.none':
    'Nothing was imported: none of the chosen files holds a CAMT.053 statement.',
  'error.category-needs-name': 'A category needs a name.',
  'error.category-exists': 'That group already has a category called {name}.',
  'error.category-not-found': 'That category is no longer there.',
  'error.category-group-not-found': 'That category group is no longer there.',
  'error.category-wrong-kind':
    'A category stays with its own kind: money in with money in, money out ' +
    'with money out.',
  'error.category-in-use':
    '{name} is still in use. Say where what uses it should go before removing it.',
  'error.category-own-destination': 'A category cannot be its own destination.',
  'error.counterparty-not-found': 'That counterparty is not in this budget.',
  'error.counterparty-self': 'A counterparty cannot be combined with itself.',
  'error.merge-nothing':
    'Nothing to combine: no statement name leads to that counterparty.',
  'error.transaction-not-found': 'That transaction is not in this budget.',
  'error.bulk-needs-scope':
    'A bulk correction needs a stated scope: an account, a period, a ' +
    'category, a counterparty, a word or the unfiled. The amount alone is not one.',
  'error.rule-not-found': 'That rule is no longer there.',
  'error.plan-needs-name': 'A planned payment needs a name.',
  'error.plan-needs-amount': 'A planned payment needs an amount above zero.',
  'error.plan-needs-start': 'A planned payment needs a start date.',
  'error.plan-bad-end': 'That end date is not a date.',
  'error.plan-end-before-start': 'An end date cannot be before the start date.',
  'error.plan-bad-interval':
    'An interval is a whole number of periods, at least one.',
  'error.plan-not-found': 'That planned payment is no longer there.',
  'error.plan-not-on-date': 'That payment does not fall on that date.',
  'error.plan-bad-date': 'That is not a date.',
  'error.plan-already-matched':
    'That transaction is already matched to another expected payment.',
  'error.month-invalid': 'That is not a month.',
  'error.month-not-kept':
    'There is no budget month {month} to plan in. Plans can be set from three ' +
    'months before the earliest transaction to twelve after the current one.',
  'error.plan-amount-invalid': 'A plan is an amount of zero or more.',
  'error.import-problem-not-found':
    'That file is no longer in the import history.',
  'error.anchor-disagrees':
    'The balance could not be applied: the budget does not agree with it.',
  'settings.backup.blurb':
    "A backup is the budget and AYQ's own records together, from one moment. " +
    'Restoring one puts both back.',

  'backup.pane': 'Backups',
  'backup.now': 'Create backup now',
  'backup.now.working': 'Backing up…',
  'backup.now.note':
    'Kept on this computer, beside the budget. Nothing is sent anywhere.',
  'backup.latest': 'Last backup {when}',
  'backup.latest.none': 'No backup yet',
  'backup.automatic': 'Automatic backups',
  'backup.automatic.note':
    'Made when AYQ opens and the newest backup is more than {hours} hours old. ' +
    'The newest {kept} automatic backups are kept; backups you make are never ' +
    'removed.',
  'backup.automatic.ok': 'Last automatic backup {when}',
  'backup.automatic.never': 'No automatic backup has been made yet',
  'backup.automatic.failed': 'The last automatic backup failed, {when}: {why}',
  'backup.lastFailed': 'The last backup failed, {when}: {why}',
  'backup.created': 'Backup made.',
  'backup.failed': 'No backup was made: {why}',
  'backup.failure.no-budget': 'there is no budget yet.',
  'backup.failure.store-unreadable': "AYQ's own records could not be read.",
  'backup.failure.write-failed': 'the backup could not be written to disk.',
  'backup.history': 'History',
  'backup.history.note': 'Newest first',
  'backup.column.created': 'Created',
  'backup.column.kind': 'Kind',
  'backup.column.size': 'Size',
  'backup.column.build': 'Made by',
  'backup.build': 'AYQ {version}, build {build}',
  'backup.kind.manual': 'Made by you',
  'backup.kind.automatic': 'Automatic',
  'backup.kind.before-restore': 'Before a restore',
  'backup.latestMark': 'Latest',
  'backup.notRestorable': 'Needs a newer AYQ',
  'backup.empty':
    'No backups yet. Create one now, or AYQ makes one the next time it opens.',
  'backup.size': '{size} MB',
  'backup.restore': 'Restore backup',
  'backup.restore.confirm':
    "Restore the backup from {when}? The budget and AYQ's own records are " +
    'replaced together. What you have now is kept as a backup first.',
  'backup.restore.go': 'Restore',
  'backup.restore.cancel': 'Cancel',
  'backup.restore.working': 'Restoring…',
  'backup.restored':
    'Restored the backup from {when}. What you had before is kept as a backup.',
  'backup.refused': 'Not restored: {why} Nothing was changed.',
  'backup.refusal.unknown-backup': 'that backup is no longer there.',
  'backup.refusal.incomplete': 'part of that backup is missing.',
  'backup.refusal.mismatch':
    'that backup has been altered, or mixes parts of different backups.',
  'backup.refusal.newer-format': 'a newer AYQ made it.',
  'backup.refusal.newer-store': 'a newer AYQ wrote its records.',
  'backup.refusal.unreadable': 'that backup cannot be read.',
  'backup.refusal.conflict': 'it would overwrite a different budget.',
  'backup.restoreFailed':
    'The restore did not finish: {why} What you had before is still in place.',
  'backup.failure.safety-backup-failed':
    'AYQ could not first back up what you have now.',
  'backup.failure.replace-failed': 'the files could not be replaced.',
  'backup.failure.open-failed': 'the restored budget would not open.',

  'about.author': 'Author',
  'about.version': 'Product version',
  'about.build': 'Build',
  'about.buildDate': 'Build date',
  'about.architecture': 'Architecture',
  'about.revision': 'AYQ revision',
  'about.revision.none': 'not a release build',
  'about.engine': 'Engine',
  'about.baseline': 'Actual baseline',
  'about.development':
    'This is a development build. It was not produced by the release ' +
    'workflow and carries no revision.',
  'about.buildDate.none': 'not a release build',
  'about.licence.ayq':
    'AYQ is proprietary software. Its own code is not released under the MIT ' +
    'licence or any other open-source licence, and having a copy of it grants ' +
    'no right to copy, modify or redistribute it.',
  'about.licence.actual':
    'AYQ is built on Actual Budget (copyright James Long), which it uses under ' +
    'the MIT licence. That licence notice ships with this application. Other ' +
    'components keep their own licences.',
  'about.localFirst':
    'AYQ keeps everything on this computer. The budget, the statements you ' +
    'import and every decision you make about them stay in your own data ' +
    'folder. AYQ has no account, sends nothing anywhere and works with no ' +
    'network at all.',
  'about.link.repository': 'Repository',
  'about.pane': 'About AYQ',
  'about.technical': 'Technical information',
  'about.technical.note':
    'For a fault report: copies the version, build, revision and engine ' +
    'details. It carries nothing about your money and no file locations.',
  'about.copy': 'Copy technical information',
  'about.copied': 'Copied.',

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
  'register.column.state': 'State',
  'register.state.none': '—',
  'detail.title': 'Transaction',
  'register.totals.filtered':
    'These totals describe the {count} transactions this filter matched, not ' +
    'everything AYQ holds. In {in} · out {out} · net {net}',
  'register.totals.all':
    'These totals describe all {count} transactions AYQ holds. ' +
    'In {in} · out {out} · net {net}',
  'register.totals.uncategorised':
    '{count} of them are uncategorised, and are counted here.',
  'register.showing': 'Showing the newest {shown} of {total}.',
  'register.select.row': 'Select this transaction',
  'register.select.shown': 'Select every transaction shown',
  'register.select.count': '{count} selected',
  'register.select.basis': 'of {shown} shown · this filter holds {total}',
  'register.select.basis.all': 'of {shown} shown',
  'register.select.whole': 'All {total} in this filter selected',
  'register.select.whole.basis':
    'every transaction the filter holds, not only the rows shown',
  'register.select.wholeFilter': 'Select all {total} in this filter',
  'register.select.shownOnly': 'Select only the {shown} shown',
  'register.select.clear': 'Clear selection',
  'register.bulk.category': 'Set category',
  'register.bulk.category.choose': 'Choose a category',
  'register.bulk.category.clear': 'No category',
  'register.bulk.category.apply': 'Apply to {count}',
  'register.bulk.byHand':
    '{count} of these were filed by hand. They are kept unless you say otherwise.',
  'register.bulk.byHand.include': 'Also change the {count} filed by hand',
  'register.bulk.counterparty': 'Set counterparty',
  'register.bulk.counterparty.choose': 'Choose a counterparty',
  'register.bulk.counterparty.reach':
    'This records the {names} bank names behind your selection as that ' +
    'counterparty. Every transaction under those names moves: {reach} in all, ' +
    '{beyond} of them not in your selection.',
  'register.bulk.counterparty.apply': 'Record {names} names as this counterparty',
  'register.bulk.counterparty.none':
    'Nothing in this selection was imported under a bank name AYQ can record.',
  'register.bulk.filed': '{count} filed.',
  'register.bulk.filed.kept':
    '{count} filed. {kept} kept as you had filed them by hand.',
  'register.bulk.moved':
    '{names} bank names recorded as {name}; {moved} transactions now belong to it.',
  'register.bulk.moved.none': 'Those names already belonged to {name}. Nothing moved.',
  'review.select.row': 'Select this counterparty',
  'review.select.shown': 'Select every counterparty shown',
  'review.select.count': '{count} selected',
  'review.select.basis': '{transactions} transactions · {out} out',
  'review.select.clear': 'Clear selection',
  'review.bulk.note':
    'One category for all of them. Filing changes these transactions; ' +
    'remembering also writes one rule per counterparty.',
  'review.bulk.filed': '{count} filed across {counterparties} counterparties.',
  'review.bulk.filed.kept':
    '{count} filed across {counterparties} counterparties. {kept} kept as you ' +
    'had filed them by hand.',
  'review.bulk.learned':
    '{count} filed, and AYQ will file these {counterparties} counterparties ' +
    'from now on.',
  'register.showMore': 'Show more',
  'register.empty':
    'Nothing has been imported yet. A statement makes an account and fills ' +
    'this table.',
  'register.emptyFiltered': 'No transaction matches this filter.',

  // The one word §5 exists for. A balance AYQ has no evidence for is Unknown,
  // and Unknown is said rather than drawn as nought.
  'figure.unknown': 'Unknown',

  'today.funds': 'Available funds',
  'today.funds.unknown':
    'One of the counted accounts has no balance AYQ can vouch for, so ' +
    'available funds cannot be stated. Set the balance on that account and ' +
    'this becomes a figure.',
  'today.account.balanceUnknown':
    'No balance yet — AYQ has movements for this account but nothing that ' +
    'says what it holds.',
  'today.account.lastImport': 'Last import {when}',
  'today.account.lastImport.never': 'Never imported',
  'today.account.bankThrough': 'Bank data through {date}',
  'today.account.bankThrough.none': 'No bank data yet',
  'today.account.setBalance': 'Set account balance',
  'today.account.agrees': 'Agrees with the bank',
  'today.account.differs': 'Differs from the bank by {amount}',
  'today.noPosition':
    'Available funds are unknown, so there is no position to project forward. ' +
    'What is planned and expected is still on Upcoming and Plan.',
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
  'today.waiting.matches': 'matches to confirm',
  'today.waiting.uncategorised': 'transactions with no category',
  'today.waiting.suggestions': 'suggested records to confirm',
  'today.waiting.none': 'Nothing is waiting on you.',
  'today.movements': 'Latest movements',
  'today.movements.all': 'all accounts',
  'today.movements.none': 'Nothing has been imported yet.',
  'today.open.upcoming': 'Open Upcoming',
  'today.open.review': 'Open Review',
  'today.open.register': 'Open Register',
  'today.open': 'Open',
  'today.accounts.select': 'Select an account for its details',
  'today.account.open': '›',
  'today.account.noAnchor': 'No balance anchor',
  'detail.action.manageCounterparty': 'Manage counterparty…',
  'review.manage': 'Manage counterparty…',
  'counterparty.back': '‹ Back',
  'counterparty.none': 'No counterparty in this budget has that key.',
  'counterparty.seen': 'Seen {first} to {last} · {count} transactions',
  'counterparty.name': 'Display name',
  'counterparty.name.owner':
    'Your name for it. What the bank printed is kept below, unchanged.',
  'counterparty.name.automatic':
    'The name the statement gave. You can call it something else; the ' +
    'statement text stays as evidence.',
  'counterparty.name.edit': 'Rename…',
  'counterparty.name.save': 'Save name',
  'counterparty.name.clear': 'Use the statement’s name',
  'counterparty.renamed':
    'This counterparty is now called {name} everywhere. What the bank ' +
    'printed is kept as it was.',
  'counterparty.renamed.cleared': 'The statement’s own name is back.',
  'counterparty.cancel': 'Leave it as it is',
  'counterparty.evidence': 'Names seen in statements',
  'counterparty.evidence.kind': 'evidence, not a decision',
  'counterparty.operational':
    'This surface is operational. Long-term spending behaviour by counterparty ' +
    'is a question for AYQ Analyses, not for this view (A37).',
  'counterparty.evidence.note':
    'One line per imported name variant, kept as evidence. A display name ' +
    'never replaces it.',
  'counterparty.variant.byHand': 'By your decision',
  'counterparty.variant.byStatement': 'By the statement',
  'counterparty.variant.undo': 'Undo this identity decision…',
  'counterparty.variant.undo.consequence':
    'The {count} transactions printed as {variant} go back to being their ' +
    'own counterparty, {key}. Every record is kept.',
  'counterparty.variant.undo.confirm': 'Undo it',
  'counterparty.variant.undone':
    '{variant} is its own counterparty again; {count} transactions moved.',
  'counterparty.rules': 'Rules that mention it',
  'counterparty.rules.none':
    'No learned rule files this counterparty. One is learned on Review, or ' +
    'when a transaction is categorised and you choose to remember it.',
  'counterparty.identity': 'Identity',
  'counterparty.merge': 'This is really another counterparty…',
  'counterparty.merge.search': 'Find a counterparty',
  'counterparty.merge.choose': 'Choose the counterparty this really is',
  'counterparty.merge.consequence':
    'Every one of the {variants} statement variants of {name} becomes ' +
    '{target}: {count} transactions move, and every record is kept. A merge ' +
    'is undone only by a further identity decision — removing those ' +
    'variants from {target}, one at a time, on its page.',
  'counterparty.merge.confirm': 'Merge into {target}',
  'counterparty.merged': '{name} is now {target}; {moved} transactions moved.',
  'counterparty.recent': 'Recent transactions',
  'today.open.accounts': 'Account details',
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
  'review.pane.title': 'Review group',
  'review.pane.sub': '{count} transactions · {out} total out · seen {seen}',
  'review.stat.counterparties': 'counterparties',
  'review.stat.transactions': 'transactions',
  'review.stat.out': 'total out',
  'review.do.file': 'File these',
  'review.do.learn': 'File these and remember',
  'review.filed': '{count} filed.',
  'review.filed.kept':
    '{count} filed. {kept} left as they were, because you had filed them ' +
    'yourself into something else.',
  'review.learned': '{count} filed, and AYQ will file this counterparty from now on.',
  'review.moved': '{count} transactions now belong to {name}.',
  'review.rename': 'Rename',
  'review.rename.save': 'Save name',
  'review.rename.cancel': 'Cancel',
  'review.rename.note':
    'Only what it is called. The counterparty itself, its rules and what the ' +
    'bank printed all stay as they are, and the next import cannot undo it.',
  'review.renamed': 'This counterparty is now called {name} everywhere.',
  'review.renamed.cleared':
    'The name you chose has been cleared; AYQ\u2019s own name is back.',
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
    'Removing a category never destroys or refiles anything in silence: what ' +
    'still uses it is counted first, and you say where it goes.',
  'categories.move': 'Move',
  'categories.move.to': 'Move to group',
  'categories.move.cancel': 'Cancel',
  'categories.moved': '{name} is now in {group}.',
  'categories.remove': 'Remove',
  'categories.remove.cancel': 'Cancel',
  'categories.remove.checking': 'Counting what uses it…',
  'categories.remove.unused':
    'Nothing uses {name}: no transaction, no rule, no planned record, no plan amount.',
  'categories.remove.inUse': '{name} is still in use:',
  'categories.remove.transactions': '{count} transactions',
  'categories.remove.rules': '{count} learned rules',
  'categories.remove.planned': '{count} planned or recurring records',
  'categories.remove.months': '{count} months with a plan amount',
  'categories.remove.destination': 'Where they should go',
  'categories.remove.destination.choose': 'Choose a destination',
  'categories.remove.destination.uncategorised': 'Leave them Uncategorised',
  'categories.remove.consequence.category':
    'The transactions, the plan amounts and the planned records move to ' +
    '{destination}; the rules follow it by name.',
  'categories.remove.consequence.uncategorised':
    'The transactions and the planned records survive without a category. The ' +
    '{rules} learned rules are removed — a rule cannot file into nothing — and ' +
    'the plan amounts are dropped.',
  'categories.remove.confirm': 'Remove {name}',
  'categories.removed': '{name} removed.',
  'categories.removed.to':
    '{name} removed; {transactions} transactions and {planned} planned records ' +
    'moved to {destination}, {rules} rules with them.',
  'categories.removed.uncategorised':
    '{name} removed; {transactions} transactions and {planned} planned records ' +
    'are now Uncategorised, and {rules} rules were removed.',
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
  'rules.column.inspect': 'Inspect',
  'rules.inspect': 'Inspect…',
  'rules.card.stands': '{counterparty} files into {category}, learned {date}.',
  'rules.card.filed': 'It has filed {filed} transactions.',
  'rules.card.byHand':
    '{byHand} of this counterparty’s transactions were filed by hand and are ' +
    'outside its reach.',
  'rules.card.correct': 'Correct…',
  'rules.card.remove': 'Remove…',
  'rules.card.cancel': 'Leave it as it is',
  'rules.card.category': 'Files into',
  'rules.card.correctConsequence':
    'Correcting re-files the {filed} transactions the rule filed into ' +
    '{category}. The {byHand} you filed yourself stay as they are, and later ' +
    'imports follow the corrected rule.',
  'rules.card.correctApply': 'Correct the rule',
  'rules.card.removeConsequence':
    'Removing stops the rule applying to later imports. The {filed} ' +
    'transactions it filed stay where they are: nothing is re-filed.',
  'rules.card.removeConfirm': 'Remove the rule',
  'rules.corrected':
    'The rule now files {counterparty} into {category}; {filed} transactions ' +
    'follow it.',
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
  'upcoming.column.recurrence': 'Recurrence',
  'upcoming.recurrence.plan': 'Plan amount',
  'upcoming.position.note':
    'Position after is Unknown where the paying account has no balance anchor; ' +
    'it is never derived from net imported movements. A matched payment is ' +
    'already reflected in the account balance.',
  'upcoming.state.expected': 'Expected',
  'upcoming.state.overdue': 'Overdue, still counted',
  'upcoming.state.suggested': 'Suggested',
  'upcoming.state.plan': 'Rest of the plan',
  'upcoming.state.dismissed': 'Dismissed',
  'upcoming.notCounted': 'not counted',
  'upcoming.position.unknown': 'Unknown',
  'upcoming.pane.position': 'Position after',
  'upcoming.pane.category': 'Category',
  'upcoming.match.note':
    'Matching runs by itself every time this screen is opened. Check again ' +
    'only if something that has happened is still shown as expected.',
  'upcoming.match.again': 'Check what has already happened',
  'upcoming.match.title': 'Automatic matching is the normal path',
  'upcoming.match.glyph': 'i',
  'upcoming.empty': 'Nothing is expected yet.',
  'upcoming.lowest': 'Lowest point {amount} on {date}',
  'upcoming.lowest.unknown':
    'Lowest point unknown — one counted account has no balance yet.',
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
  'upcoming.pane.title': 'Planned payment',
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
  'plan.currency': '€',
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
  'plan.column.suggested': 'Suggested',
  'plan.suggestion.none': 'No basis yet',
  'plan.suggestion.basis': 'from {months} months',
  'plan.suggestion.use': 'Use suggestion',
  'plan.suggestion.useAll': 'Use all suggestions',
  'plan.suggestion.wholeBasis':
    'Suggestions are the average of {months} complete, reliably covered ' +
    'months, {from} to {to}. Months AYQ holds only part of are left out ' +
    'rather than counted as nothing. Accepting one is your decision; nothing ' +
    'here changes a plan on its own, and Use all suggestions fills only rows ' +
    'with no plan in them.',
  'plan.suggestion.noBasis':
    'There is no complete, reliably covered month behind this one, so there ' +
    'is nothing to suggest from. Importing statements that cover whole months ' +
    'gives AYQ something to average.',
  'plan.empty': 'This budget has no categories yet.',

  'accounts.column.name': 'Account',
  'accounts.column.counts': 'In available funds',
  'accounts.column.statements': 'Statements to',
  'accounts.column.balance': 'Balance',
  'accounts.column.agrees': 'Agrees with the bank',
  'accounts.column.details': 'Details',
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
  'accounts.detail.statements': 'Statements through',
  'accounts.detail.balance': 'Balance',
  'accounts.detail.operational': 'Operational state',
  'accounts.detail.anchor': 'Anchor',
  'accounts.detail.anchor.bank': 'the bank stated it on {date}',
  'accounts.detail.anchor.manual': 'you set it, for {date}',
  'accounts.detail.anchor.none':
    'No balance has been set. AYQ holds this account\u2019s movements but ' +
    'nothing that says what it holds, so its balance is Unknown.',
  'accounts.detail.anchorHistory': 'Earlier balances',
  'accounts.detail.lastImport': 'Last successful import',
  'accounts.detail.lastImport.never': 'Nothing has been imported yet',
  'accounts.detail.bankThrough': 'Bank data through',
  'accounts.detail.bankThrough.none': 'No statement has been read yet',
  'accounts.detail.configure':
    'Whether this account counts toward available funds is set in ' +
    'Settings \u2192 Accounts.',
  'accounts.back': '‹ Back to Today',

  // Setting and correcting a balance (§4.4, §4.5).
  'balance.set.title': 'Set account balance',
  'balance.reanchor.title': 'Correct this balance',
  'balance.account': 'Account',
  'balance.amount': 'Balance',
  'balance.amount.hint':
    'As your bank states it, in euro. A negative balance is written with a ' +
    'minus sign.',
  'balance.date': 'On this date',
  'balance.date.hint':
    'The day the balance is true on. The figure you enter must already ' +
    'include every transaction imported up to and including this day.',
  'balance.save': 'Set balance',
  'balance.cancel': 'Cancel',
  'balance.invalid': 'Enter a balance in euro, such as 1240.55 or -80.',
  'balance.invalidDate': 'Enter the date as YYYY-MM-DD.',
  'balance.wanted':
    'The statements just imported carry no balance from the bank, so AYQ ' +
    'cannot say what this account holds. Set it here, or leave it \u2014 the ' +
    'import succeeded either way.',
  'balance.skip': 'Not now',
  'balance.reanchor':
    'This adds a new balance and keeps the old one. Nothing is written into ' +
    'the ledger and no transaction is created.',
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
  'settings.accounts.kind': 'Bank account',
  'settings.accounts.openOne': 'Open account details',

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
  // 03 §11.11: an automatic filing has to be visible as one. Falling through to
  // "nobody has decided yet" would have been a plain untruth — AYQ decided.
  'detail.by.ayq': 'filed by AYQ',
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
  'detail.history.lineBecause': '{category} — {by}, {when}: {because}',
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
  'appearance.buttons.disabled': 'Disabled',
  'appearance.buttons.primary': 'Filled',
  'appearance.buttons.secondary': 'Plain',
  'appearance.saving': 'Saving…',
  'appearance.failed': 'The ground could not be saved: {reason}',

  'state.confirmed': 'Owner set',
  'state.rule': 'Rule applied',
  'state.suggested': 'Suggested',
  'state.overdue': 'Attention',
  'state.neutral': 'Neutral',
  'state.uncategorised': 'Uncategorised',
  'state.operational': 'Coverage complete',
  'state.rule.glyph': 'ƒ',
  'state.operational.tick': '✓',

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

const MEGABYTES = new Intl.NumberFormat(AYQ_LOCALE, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

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

/**
 * The minus sign carrying direction (04 A19): the typographic minus, U+2212,
 * never the hyphen the formatter falls back to.
 */
function minus(text: string): string {
  return text.replace(/^-/, '−');
}

/** Integer cents with the currency symbol. */
export function ayqMoney(cents: number): string {
  return minus(MONEY.format(cents / 100));
}

/**
 * Integer cents without the symbol, for a column of figures (04 A19).
 *
 * The symbol is dropped in a table because it repeats down every row and says
 * nothing after the first; the column heading carries it.
 */
export function ayqAmount(cents: number): string {
  return minus(AMOUNT.format(cents / 100));
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

/** A size on disk, in megabytes to one place, as the locale writes it. */
export function ayqMegabytes(bytes: number): string {
  // Never "0.0 MB" for something that is there.
  const shown = Math.max(bytes / 1_048_576, bytes > 0 ? 0.1 : 0);
  return ayqText('backup.size', { size: MEGABYTES.format(shown) });
}

/** "a, b and c", as the locale joins them. */
export function ayqList(items: readonly string[]): string {
  return LIST.format(items);
}
