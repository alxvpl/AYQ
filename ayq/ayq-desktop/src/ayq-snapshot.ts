// The analytical snapshot AYQ produces for AYQ Analyses (03 §13).
//
// One read-only export of what AYQ already holds as canonical truth, in the
// executable contract 1.0 shape, validated by the same validator the consumer
// runs before a byte is written, and written atomically to the local file the
// owner chose (03 §13.10). Nothing is decided here: every counterparty,
// category, transfer, reversal, coverage, reconciliation, plan and forecast
// fact crosses exactly as AYQ resolved it, and what AYQ does not know crosses
// as absence, never as zero or as a guess (03 §13.5, §8.7).
//
// Data minimisation (03 §13.8): no IBAN, mandate, end-to-end id, servicer
// reference, BIC, bank transaction code, raw bank description, Actual id or
// store shape crosses. Transaction keys are opaque digests of AYQ's own row
// key, so a bank reference never becomes the key. The evidence text is the
// resolver's own recognition name for the counterparty — the normalised name
// the owner sees in the Register — bounded and single-line.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import api from '@actual-app/api';

import type {
  AnalyticalSnapshotV1,
  Account as ContractAccount,
  CanonicalForecast,
  CategorySource,
  ExpectationRecord,
  ExpectedOccurrence,
  Money,
  Schedule,
  Transaction as ContractTransaction,
  TransactionClass,
  TransactionCounterparty,
} from '../../ayq-analytical-contract/src/index.ts';
import { validateAnalyticalSnapshot } from '../../ayq-analytical-contract/src/index.ts';
import type { AyqAbout, AyqPlannedRecord, AyqSnapshotExport } from '../../ayq-client/src/ayq-ipc-contract.ts';

import { ayqCanonicalKey } from './ayq-aliases.ts';
import { ayqAccountedFor, ayqActiveAnchor } from './ayq-anchors.ts';
import { ayqBankDataThrough, ayqClosingEvidence, ayqProvenIntervals } from './ayq-evidence.ts';
import { ayqCountsTowardFunds, ayqIsInternalTransfer, ayqOwnAccountNames } from './ayq-funds.ts';
import { ayqAccounts } from './ayq-ledger.ts';
import { ayqDisplayName } from './ayq-names.ts';
import { ayqForecast, ayqPlan } from './ayq-plan.ts';
import { ayqReadStore, ayqRowKey, ayqStandingDecision, type AyqStore } from './ayq-store.ts';

/** AYQ keeps one currency: the euro of the statements it imports. */
const CURRENCY = 'EUR';

const CONTRACT_VERSION = '1.0';

/** The resolver's payment kinds (ayq-camt), as the contract's classes. */
const CLASS_OF_KIND: Record<string, TransactionClass> = {
  'card-terminal': 'card_payment',
  'card-withdrawal': 'cash_withdrawal',
  'direct-debit': 'direct_debit',
  'credit-transfer': 'credit_transfer',
  'bank-fee': 'bank_fee',
};

type QueriedRow = {
  id: string;
  date: string;
  amount: number;
  imported_id: string | null;
  imported_payee: string | null;
  payee: string | null;
  accountId: string | null;
  categoryId: string | null;
  starting_balance_flag: boolean | null;
};

function money(amount: number): Money {
  return { amount, currency: CURRENCY };
}

/**
 * An opaque, stable transaction key: a digest of AYQ's own row key, which is
 * the bank's `imported_id` when there is one and Actual's id otherwise. Stable
 * while the same budget persists (03 §13.6); never the bank reference itself.
 */
export function ayqSnapshotTransactionKey(rowKey: string): string {
  return `tx-${createHash('sha256').update(rowKey, 'utf8').digest('hex').slice(0, 24)}`;
}

function accountKeyOf(accountId: string): string {
  return `acc-${createHash('sha256').update(accountId, 'utf8').digest('hex').slice(0, 16)}`;
}

/**
 * The masked display identifier. AYQ names an imported account by its masked
 * IBAN — `AYQ NL…0708` — so the identifier is that name without the prefix.
 * An account not named that way has no identifier AYQ can vouch for and is
 * refused by the contract rather than given an invented one.
 */
function displayIdentifierOf(name: string): string | null {
  const match = /^AYQ ([A-Z]{2}…[A-Z0-9]{4})$/.exec(name.trim());
  return match ? match[1] : null;
}

/**
 * A full IBAN: two letters, two digits, then eleven to thirty more
 * characters. The contract's leak check runs this over the text with every
 * space removed, because a bank prints an IBAN in groups of four; so the
 * withholding here looks at the same spaceless text and maps what it finds
 * back onto the original, spaces and all.
 */
const IBAN_LIKE = /[A-Z]{2}\d{2}[A-Z0-9]{11,30}/;
/** The shortest run the check would flag: where the withholding starts. */
const IBAN_SHORTEST = /[A-Z]{2}\d{2}[A-Z0-9]{11}/;
/** A printed IBAN group that may continue it: up to four characters with a digit. */
const IBAN_GROUP = /^(?=.*\d)[A-Z0-9]{1,4}$/i;

/**
 * Withholds, word by word, whatever the contract's check would flag: the
 * words that overlap the shortest flagged run in the spaceless text, and the
 * printed groups that continue it, are replaced by one ellipsis, and the text
 * is checked again until nothing is flagged. Word granularity, because the
 * spaceless view has no word boundaries and a character-exact cut would leave
 * fragments the check could still read; the shortest run, because the greedy
 * one would swallow the words after the identifier.
 */
function withholdIbans(text: string): string {
  let words = text.split(' ');
  for (;;) {
    // Each word's span in the spaceless view, in the same UTF-16 units the
    // match index counts in.
    const spans: Array<{ from: number; to: number }> = [];
    let cursor = 0;
    for (const word of words) {
      spans.push({ from: cursor, to: cursor + word.length });
      cursor += word.length;
    }
    const spaceless = words.join('').toUpperCase();
    if (!IBAN_LIKE.test(spaceless)) return words.join(' ');
    const match = IBAN_SHORTEST.exec(spaceless);
    if (match === null) return words.join(' ');
    const from = match.index;
    const to = from + match[0].length;
    const overlapping = new Set<number>();
    spans.forEach((span, index) => {
      if (span.from < to && span.to > from && span.to > span.from) overlapping.add(index);
    });
    let last = Math.max(...overlapping);
    while (last + 1 < words.length && IBAN_GROUP.test(words[last + 1])) {
      last += 1;
      overlapping.add(last);
    }
    const next: string[] = [];
    let replaced = false;
    words.forEach((word, index) => {
      if (!overlapping.has(index)) {
        next.push(word);
        replaced = false;
      } else if (!replaced) {
        next.push('…');
        replaced = true;
      }
    });
    words = next;
  }
}

/** 256 code points, one line, and no obvious full IBAN (03 §13.8). */
export function ayqSnapshotEvidence(text: string | null): string {
  if (text === null) return '';
  const oneLine = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  const withheld = withholdIbans(oneLine).replace(/\s+/g, ' ').trim();
  const points = [...withheld];
  return points.length > 256 ? points.slice(0, 256).join('') : withheld;
}

function scheduleOf(record: AyqPlannedRecord): Schedule {
  const { frequency, interval } = record.recurrence;
  if (frequency === 'once') return { type: 'one_time', date: record.startDate };
  const anchorDate = record.startDate;
  switch (frequency) {
    case 'weekly':
      return { type: 'recurring', frequency: 'weekly', interval, anchorDate };
    case 'fortnightly':
      return { type: 'recurring', frequency: 'weekly', interval: interval * 2, anchorDate };
    case 'monthly':
      return { type: 'recurring', frequency: 'monthly', interval, anchorDate };
    case 'quarterly':
      return { type: 'recurring', frequency: 'monthly', interval: interval * 3, anchorDate };
    case 'half-yearly':
      return { type: 'recurring', frequency: 'monthly', interval: interval * 6, anchorDate };
    case 'yearly':
      return { type: 'recurring', frequency: 'yearly', interval, anchorDate };
  }
}

function sourceOf(decision: { source: 'manual' | 'rule' | 'auto' } | null): CategorySource {
  // A category with no recorded decision was set by nobody AYQ's automation
  // knows of — not a rule, not the classifier — which by 03 §4.3 leaves a
  // person. Every category AYQ itself sets records its decision.
  if (decision === null) return 'manual';
  return decision.source === 'rule' ? 'learned_rule' : decision.source === 'auto' ? 'automatic' : 'manual';
}

async function allRows(): Promise<QueriedRow[]> {
  const answer = (await api.aqlQuery(
    api
      .q('transactions')
      .filter({ starting_balance_flag: false })
      .select([
        'id',
        'date',
        'amount',
        'imported_id',
        'imported_payee',
        'starting_balance_flag',
        { payee: 'payee.name' },
        { accountId: 'account.id' },
        { categoryId: 'category.id' },
      ]),
  )) as { data?: QueriedRow[] };
  return answer.data ?? [];
}

/**
 * Builds the snapshot from the open budget. Pure assembly: it reads what the
 * engine already computes for the screens and states it in the contract's
 * terms. Throws ContractValidationError if what it built does not validate —
 * in which case nothing is written.
 */
export async function ayqBuildAnalyticalSnapshot(
  dataDir: string,
  budgetId: string,
  today: string,
  about: AyqAbout,
  now: Date = new Date(),
): Promise<AnalyticalSnapshotV1> {
  const store = ayqReadStore(dataDir);
  const summaries = await ayqAccounts(dataDir);
  const ownNames = ayqOwnAccountNames(summaries);
  const accountKeyById = new Map(summaries.map(account => [account.id, accountKeyOf(account.id)]));
  const accountIdByName = new Map(summaries.map(account => [account.name, account.id]));

  // ---- accounts -----------------------------------------------------------
  const accounts: ContractAccount[] = [];
  for (const summary of summaries) {
    const through = ayqBankDataThrough(store, summary.id);
    // An account with nothing imported has no coverage to state and no
    // transactions to analyse; it does not enter the snapshot.
    if (through === null) continue;
    const identifier = displayIdentifierOf(summary.name);
    if (identifier === null) {
      throw new Error(`Account "${summary.name}" carries no masked identifier AYQ can vouch for.`);
    }
    // The proven start: the proven interval that reaches the through date, if
    // any. Absent otherwise — never the earliest transaction (03 §8.7).
    const reaching = ayqProvenIntervals(store, summary.id).find(interval => interval.to === through);
    const coverageStartDate = reaching?.from;

    // Reconciliation, only where the bank stated a closing balance at the
    // coverage date and AYQ can account for the movements up to it; at any
    // earlier statement date it is not "at the coverage date" and stays
    // unavailable rather than being restated.
    const closing = ayqClosingEvidence(store, summary.id);
    let bankClosingBalance: Money | undefined;
    let reconciliation: ContractAccount['reconciliation'] = { state: 'unavailable' };
    if (closing !== null && closing.closingBalanceCents !== null && closing.toDate === through) {
      const accounted = await ayqAccountedFor(store, summary.id, closing.toDate);
      if (accounted !== null) {
        const difference = closing.closingBalanceCents - accounted.accountedCents;
        bankClosingBalance = money(closing.closingBalanceCents);
        reconciliation = {
          state: difference === 0 ? 'agrees' : 'differs',
          ledgerBalanceAtCoverageDate: money(accounted.accountedCents),
          difference: money(difference),
        };
      }
    }

    const anchor = ayqActiveAnchor(store, summary.id);
    accounts.push({
      accountKey: accountKeyById.get(summary.id)!,
      name: summary.name,
      type: 'unknown',
      displayIdentifier: identifier,
      countsTowardAvailableFunds: ayqCountsTowardFunds(store, summary.id),
      currency: CURRENCY,
      statementCoverage: {
        ...(coverageStartDate !== undefined ? { coverageStartDate } : {}),
        lastStatementDate: through,
        ...(bankClosingBalance !== undefined ? { bankClosingBalance } : {}),
      },
      absoluteBalance:
        anchor !== null && summary.balanceCents !== null ? { state: 'known', amount: money(summary.balanceCents) } : { state: 'unknown' },
      reconciliation,
    });
  }
  const includedAccountIds = new Set(
    summaries.filter(one => accounts.some(a => a.accountKey === accountKeyById.get(one.id))).map(one => one.id),
  );

  // ---- categories ---------------------------------------------------------
  const groups = await api.getCategoryGroups();
  const categoryGroups = groups.map(group => ({ categoryGroupId: `grp-${group.id}`, name: group.name }));
  const categoryList = await api.getCategories();
  const categories = categoryList.map(category => ({
    categoryId: `cat-${category.id}`,
    name: category.name,
    categoryGroupId: `grp-${category.group_id ?? ''}`,
  }));
  const categoryIdByActual = new Map(categoryList.map(category => [category.id, `cat-${category.id}`]));
  const categoryIdByName = new Map(categoryList.map(category => [category.name, `cat-${category.id}`]));

  // ---- transactions -------------------------------------------------------
  const rows = (await allRows()).filter(row => row.accountId !== null && includedAccountIds.has(row.accountId));
  rows.sort((left, right) => (left.date < right.date ? -1 : left.date > right.date ? 1 : left.id < right.id ? -1 : 1));
  const counterpartyNames = new Map<string, string>();
  const transactions: ContractTransaction[] = [];
  const keyByActualId = new Map<string, string>();
  // Transfer pairing: the other side is the row in the counter account on the
  // same day with the opposite amount, not yet paired. What cannot be paired
  // keeps its own pairKey; the contract admits a lone side.
  const unpaired = new Map<string, ContractTransaction[]>();

  for (const row of rows) {
    const rowKey = ayqRowKey(row);
    const provenance = store.provenance[rowKey];
    const transactionKey = ayqSnapshotTransactionKey(rowKey);
    keyByActualId.set(row.id, transactionKey);
    const accountKey = accountKeyById.get(row.accountId!)!;
    const kind = provenance?.kind ?? null;
    const transactionClass: TransactionClass =
      kind !== null && CLASS_OF_KIND[kind] !== undefined ? CLASS_OF_KIND[kind] : 'other';

    // An internal transfer is one whose counter account is another account in
    // this snapshot. A movement to an own account the snapshot does not cover
    // (nothing imported for it) is, for the snapshot, an ordinary movement to
    // an account AYQ knows by name only.
    let counterAccountKey: string | undefined;
    if (ownNames.size >= 2 && ayqIsInternalTransfer(ownNames, provenance)) {
      const iban = provenance?.counterpartyIban ?? null;
      const counterName = iban !== null ? `AYQ ${iban.slice(0, 2)}…${iban.slice(-4)}` : null;
      const counterId = counterName !== null ? accountIdByName.get(counterName) : undefined;
      const key = counterId !== undefined && includedAccountIds.has(counterId) ? accountKeyById.get(counterId) : undefined;
      if (key !== undefined && key !== accountKey) counterAccountKey = key;
    }
    const isTransfer = counterAccountKey !== undefined;

    const canonical = ayqCanonicalKey(store, provenance?.counterpartyKey, provenance?.counterpartyName);
    let counterparty: TransactionCounterparty;
    if (isTransfer || transactionClass === 'cash_withdrawal') {
      counterparty = { state: 'not_applicable' };
    } else if (canonical !== null) {
      // The owner's own name for the counterparty outranks the automatic one
      // (8 §8.2); the automatic one is the newest transaction's, as the
      // Counterparties screen shows it — rows arrive oldest first, so the last
      // write is the newest.
      counterpartyNames.set(
        canonical,
        ayqDisplayName(store, canonical, row.payee ?? provenance?.counterpartyName ?? null) ?? canonical,
      );
      counterparty = { state: 'identified', counterpartyKey: canonical };
    } else {
      counterparty = { state: 'unresolved' };
    }

    let category: ContractTransaction['category'];
    if (isTransfer) {
      category = { state: 'not_applicable' };
    } else if (row.categoryId !== null && categoryIdByActual.has(row.categoryId)) {
      const source = sourceOf(ayqStandingDecision(store, rowKey));
      // A learned rule is keyed on the canonical counterparty (03 §4.1); that
      // key names the rule.
      const ruleKey = source === 'learned_rule' ? (canonical ?? 'rule') : undefined;
      category = {
        state: 'categorised',
        categoryId: categoryIdByActual.get(row.categoryId)!,
        source,
        ...(ruleKey !== undefined ? { ruleKey } : {}),
      };
    } else {
      category = { state: 'uncategorised' };
    }

    // A reversal AYQ holds evidence for reverses something the snapshot does
    // not name: the bank's evidence classifies the movement, it does not link
    // it to the original (03 §9.4). The contract's reversal fact requires the
    // original, so no reversal fact crosses and the credit crosses as what the
    // ledger holds. Reported as a producer limitation, not silently.
    const transaction: ContractTransaction = {
      transactionKey,
      accountKey,
      bookingDate: row.date,
      amount: money(Number(row.amount ?? 0)),
      transactionClass,
      counterparty,
      category,
      evidenceText: ayqSnapshotEvidence(provenance?.counterpartyName ?? row.payee ?? row.imported_payee ?? null),
    };

    if (counterAccountKey !== undefined) {
      const pairSignature = `${row.date}|${Math.abs(transaction.amount.amount)}`;
      const candidates = unpaired.get(pairSignature) ?? [];
      const other = candidates.find(
        c =>
          c.accountKey === counterAccountKey &&
          c.internalTransfer!.counterAccountKey === accountKey &&
          Math.sign(c.amount.amount) !== Math.sign(transaction.amount.amount),
      );
      if (other !== undefined) {
        candidates.splice(candidates.indexOf(other), 1);
        transaction.internalTransfer = { pairKey: other.internalTransfer!.pairKey, counterAccountKey };
      } else {
        transaction.internalTransfer = { pairKey: `pair-${transactionKey}`, counterAccountKey };
        candidates.push(transaction);
        unpaired.set(pairSignature, candidates);
      }
    }
    transactions.push(transaction);
  }

  const counterparties = [...counterpartyNames.entries()]
    .map(([counterpartyKey, displayName]) => ({ counterpartyKey, displayName }))
    .sort((a, b) => (a.counterpartyKey < b.counterpartyKey ? -1 : 1));

  // ---- expectations ---------------------------------------------------------
  const plan = ayqPlan(dataDir, today);
  const expectationRecords: ExpectationRecord[] = [];
  const recordStateSince = new Map<string, string>();
  for (const record of plan.records) {
    if (record.state !== 'confirmed' && record.state !== 'suggested') continue;
    const stateSince = (record.state === 'confirmed' ? record.confirmedAt : record.suggestedAt) ?? record.createdAt.slice(0, 10);
    const categoryId = record.categoryName !== null ? categoryIdByName.get(record.categoryName) : undefined;
    const counterpartyKey = record.counterpartyKey !== null && counterpartyNames.has(record.counterpartyKey) ? record.counterpartyKey : undefined;
    recordStateSince.set(record.id, stateSince);
    expectationRecords.push({
      recordKey: `rec-${record.id}`,
      kind: record.kind,
      name: record.name,
      ...(counterpartyKey !== undefined ? { counterpartyKey } : {}),
      category: categoryId !== undefined ? { state: 'categorised', categoryId } : { state: 'uncategorised' },
      amount: money(Math.abs(record.amountCents)),
      schedule: scheduleOf(record),
      state: record.state,
      stateSince,
    });
  }
  const expectedOccurrences: ExpectedOccurrence[] = [];
  for (const occurrence of plan.occurrences) {
    const stateSince = recordStateSince.get(occurrence.recordId);
    if (stateSince === undefined) continue;
    // An occurrence dated before the day its record was decided is history,
    // not an expectation (03 §7.14); it does not cross.
    if (occurrence.effectiveDate < stateSince) continue;
    let state: ExpectedOccurrence['state'];
    let match: ExpectedOccurrence['match'];
    if (occurrence.state === 'matched' && occurrence.matchedTransactionId !== null) {
      const transactionKey = keyByActualId.get(occurrence.matchedTransactionId);
      if (transactionKey === undefined) continue;
      state = 'matched';
      match = { transactionKey, source: occurrence.matchProvenance ?? 'automatic', matchedOn: today };
    } else if (occurrence.state === 'dismissed') state = 'dismissed';
    else if (occurrence.state === 'overdue' && occurrence.effectiveDate < today) state = 'overdue';
    else state = 'expected';
    expectedOccurrences.push({
      occurrenceKey: `occ-${occurrence.recordId}-${occurrence.dueDate}`,
      recordKey: `rec-${occurrence.recordId}`,
      expectedDate: occurrence.effectiveDate,
      amount: money(Math.abs(occurrence.amountCents)),
      state,
      ...(match !== undefined ? { match } : {}),
    });
  }

  // ---- forecast ------------------------------------------------------------
  const forecastView = await ayqForecast(dataDir, today);
  const basisAccountKeys = accounts.filter(a => a.countsTowardAvailableFunds).map(a => a.accountKey);
  let forecast: CanonicalForecast;
  if (forecastView.availableFundsCents === null) {
    forecast = {
      state: 'unavailable',
      kind: 'canonical_ayq_forecast',
      asOfDate: forecastView.today,
      horizonMonths: 12,
      horizonEnd: forecastView.horizon,
      basisAccountKeys,
      unavailableReason: 'available funds unknown: an account that counts has no balance anchor',
    };
  } else {
    const series = forecastView.months
      .filter(month => month.closingCents !== null)
      .map(month => ({ date: lastDayOf(month.month), projectedPosition: money(month.closingCents!) }))
      .filter(point => point.date >= forecastView.today && point.date <= forecastView.horizon);
    forecast = {
      state: 'available',
      kind: 'canonical_ayq_forecast',
      asOfDate: forecastView.today,
      horizonMonths: 12,
      horizonEnd: forecastView.horizon,
      currency: CURRENCY,
      basisAccountKeys,
      openingPosition: money(forecastView.availableFundsCents),
      series,
    };
  }

  // ---- meta ------------------------------------------------------------------
  const funded = accounts.filter(a => a.countsTowardAvailableFunds);
  const boundary = funded.length === 0 ? undefined : funded.map(a => a.statementCoverage.lastStatementDate).sort()[0];
  const nonTransfer = transactions.filter(t => t.internalTransfer === undefined);
  const generatedAt = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const snapshot: AnalyticalSnapshotV1 = {
    meta: {
      contractVersion: CONTRACT_VERSION,
      snapshotId: `snap-${createHash('sha256').update(`${budgetId}|${generatedAt}`).digest('hex').slice(0, 24)}`,
      generatedAt,
      budgetKey: `budget-${createHash('sha256').update(budgetId, 'utf8').digest('hex').slice(0, 16)}`,
      producer: {
        productVersion: about.productVersion,
        buildNumber: Number.parseInt(about.buildNumber, 10) || 0,
        commitSha: about.revision ?? 'unknown',
      },
      currencies: accounts.length > 0 ? [CURRENCY] : [],
      coverage: {
        ...(boundary !== undefined ? { reliabilityBoundary: boundary } : {}),
        reliabilityBoundaryBasis: funded.filter(a => a.statementCoverage.lastStatementDate === boundary).map(a => a.accountKey),
      },
      counts: {
        accounts: accounts.length,
        transactions: transactions.length,
        counterparties: counterparties.length,
        categories: categories.length,
        expectedOccurrences: expectedOccurrences.length,
        uncategorisedTransactions: transactions.filter(t => t.category.state === 'uncategorised').length,
        unresolvedCounterparties: nonTransfer.filter(t => t.counterparty.state === 'unresolved').length,
        counterpartyNotApplicable: nonTransfer.filter(t => t.counterparty.state === 'not_applicable').length,
      },
    },
    accounts,
    counterparties,
    categoryGroups,
    categories,
    transactions,
    categoryPlans: [],
    expectationRecords,
    expectedOccurrences,
    forecast,
  };

  // The same validator the consumer runs. What does not validate is not written.
  return validateAnalyticalSnapshot(JSON.parse(JSON.stringify(snapshot)));
}

function lastDayOf(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, monthNumber, 0));
  return last.toISOString().slice(0, 10);
}

/**
 * Builds and writes the snapshot to `path`, atomically: the file is written
 * beside its destination and moved into place, so an interrupted export leaves
 * either the previous file or the new one (03 §13.10). Returns counts only —
 * nothing in the answer is a figure from the owner's money.
 */
export async function ayqExportAnalyticalSnapshot(
  dataDir: string,
  budgetId: string,
  today: string,
  about: AyqAbout,
  path: string,
): Promise<AyqSnapshotExport> {
  const snapshot = await ayqBuildAnalyticalSnapshot(dataDir, budgetId, today, about);
  const text = JSON.stringify(snapshot, null, 2);
  const bytes = Buffer.byteLength(text, 'utf8');
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, text, 'utf8');
    renameSync(temporary, path);
  } catch (error) {
    // Whatever failed, the half-written file is not left beside the target.
    rmSync(temporary, { force: true });
    throw error;
  }

  // Success is claimed only for what can be shown: the file is read back from
  // the path the owner chose, at the size that was written, and the temporary
  // file is gone. A write that "returned" but left nothing there is a failure
  // and says so.
  let written: number;
  try {
    written = statSync(path).size;
  } catch {
    throw new Error(`The file was not there after writing it: ${path}`);
  }
  if (written !== bytes) {
    throw new Error(`The file on disk is ${written} bytes where ${bytes} were written: ${path}`);
  }
  if (existsSync(temporary)) {
    throw new Error(`The temporary file was not moved into place: ${temporary}`);
  }

  return {
    path,
    generatedAt: snapshot.meta.generatedAt,
    accounts: snapshot.meta.counts.accounts,
    transactions: snapshot.meta.counts.transactions,
    counterparties: snapshot.meta.counts.counterparties,
    bytes,
  };
}
