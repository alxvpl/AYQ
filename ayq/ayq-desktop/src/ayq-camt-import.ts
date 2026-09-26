// Importing a CAMT.053 file or ZIP into the open budget.
//
// Every step of this already existed: `ayq-camt` reads the file (a ZIP in
// memory, never extracted) and parses it into lossless records, the bridge
// resolves the counterparty and maps each record onto an Actual transaction,
// and `@actual-app/api` takes them. Nothing here parses CAMT itself.
//
// What this file adds is memory. Actual keeps the transaction; AYQ keeps what
// Actual has no field for — the counterparty key, the mandate, the bank
// transaction code, the raw description — beside the budget, keyed by the same
// `imported_id`. That is what makes a transaction explainable afterwards, and
// what makes a rule able to say "this counterparty, from now on".

import { basename } from 'node:path';

import api from '@actual-app/api';

import { ayqToActualTransaction } from '../../ayq-actual-bridge/src/ayq-actual-transaction.ts';
import { ayqWithAccount } from '../../ayq-actual-bridge/src/ayq-prepare.ts';
import { ayqParseCamt } from '../../ayq-camt/src/ayq-camt053.ts';
import { ayqCollectTargets } from '../../ayq-camt/src/ayq-files.ts';
import type { AyqBankEntry } from '../../ayq-camt/src/ayq-types.ts';
import { ayqResolveCounterparty } from '../../ayq-camt/src/counterparty/ayq-resolve.ts';
import type {
  AyqImportAccountOutcome,
  AyqImportProblem,
  AyqImportRecord,
  AyqImportSummary,
  AyqProvenance,
} from '../../ayq-client/src/ayq-ipc-contract.ts';

import { ayqKindWanted, ayqNewAccountProfile } from './ayq-account-kind.ts';
import { ayqAliasMap } from './ayq-aliases.ts';
import { ayqMaskIban } from './ayq-mask.ts';
import { ayqTransactionCount } from './ayq-ledger.ts';
import { ayqRunMatching } from './ayq-plan.ts';
import { ayqApplyFiling, ayqApplyRules } from './ayq-rules.ts';
import { ayqSettle } from './ayq-settle.ts';
import { ayqActiveAnchor, ayqReapplyAnchor } from './ayq-anchors.ts';
import { ayqAddDays } from './ayq-dates.ts';
import {
  ayqId,
  ayqReadStore,
  ayqWriteStore,
  type AyqAccountProfile,
  type AyqCoverageEvidence,
} from './ayq-store.ts';
import { AyqEngineError } from './ayq-error.ts';

/** What an account is called when its statement names no IBAN at all. */
const AYQ_UNNAMED_ACCOUNT = 'AYQ imported account';

/**
 * The name one statement's account gets: that statement's own IBAN, masked.
 *
 * Only ever from the statement the entry came from (PF-006 F1). An earlier
 * version named the whole import after the first entry it read, so a ZIP of
 * several accounts' statements landed in one account called after whichever
 * file sorted first.
 */
export function ayqAccountNameOf(entry: AyqBankEntry): string {
  return ayqMaskIban(entry.statement.accountIban) ?? AYQ_UNNAMED_ACCOUNT;
}

/**
 * The entries of one import, one group per account the statements reported
 * on, in name order so the same files always produce the same order.
 *
 * Order within a group is the order the files were read in, which is what the
 * rest of the import already relies on.
 */
export function ayqGroupByAccount(
  entries: AyqBankEntry[],
): Array<{ name: string; entries: AyqBankEntry[] }> {
  const groups = new Map<string, AyqBankEntry[]>();
  for (const entry of entries) {
    const name = ayqAccountNameOf(entry);
    const held = groups.get(name);
    if (held === undefined) groups.set(name, [entry]);
    else held.push(entry);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([name, grouped]) => ({ name, entries: grouped }));
}

/** The currency the statements state for their account, if any of them does. */
function statedCurrency(entries: AyqBankEntry[]): string | null {
  for (const entry of entries) {
    const currency = entry.statement.accountCurrency ?? entry.statement.closingBalance?.currency;
    if (typeof currency === 'string' && currency.length === 3) return currency;
  }
  return null;
}

/**
 * What each statement in the file proves, as an interval (§6.2).
 *
 * One row per statement, not one per file and not one per account: the union of
 * intervals is what proves a complete month, and a union cannot be built out of
 * "the furthest date seen". The closing balance rides along when the bank
 * stated one and is null when it did not — coverage does not depend on it,
 * which is the whole of the change from version 7.
 *
 * `fromDate` is the statement's own stated start and nothing else. The booking
 * date of the first entry is *not* used for it: a statement that begins on the
 * 15th because the first fortnight had no movements and one that begins on the
 * 15th because half of it is missing look identical from the entries alone, and
 * treating them alike would manufacture coverage AYQ does not have. The end
 * falls back to the last booking date because a file that lists entries has
 * demonstrably been read that far.
 */
function coverageEvidence(
  entries: AyqBankEntry[],
  accountId: string,
  importId: string,
  readAt: string,
  statementAccount: string,
): AyqCoverageEvidence[] {
  const byStatement = new Map<string, AyqCoverageEvidence>();

  for (const entry of entries) {
    const statement = entry.statement;
    const stated = statement.toDate?.slice(0, 10) ?? null;
    const booked = entry.bookingDate.date;
    const toDate = stated ?? booked;
    if (toDate === null) continue;

    // One row per statement in the file. The identity is the statement's own
    // identifier where it has one, and its stated period otherwise.
    const identity = `${statement.file ?? ''}|${statement.statementId ?? ''}|${statement.electronicSequenceNumber ?? ''}|${statement.fromDate ?? ''}|${statement.toDate ?? ''}`;
    const held = byStatement.get(identity);

    if (held === undefined) {
      const closing = statement.closingBalance;
      byStatement.set(identity, {
        accountId,
        importId,
        fromDate: statement.fromDate?.slice(0, 10) ?? null,
        toDate,
        closingBalanceCents:
          closing && closing.value !== null
            ? Math.round(closing.value * 100)
            : null,
        file: statement.file,
        readAt,
        // Which account the statement itself reported on (PF-006 F6).
        statementAccount,
      });
      continue;
    }

    // Only the fallback end moves: a stated end is the bank's word and the
    // entries cannot argue with it.
    if (stated === null && booked !== null && booked > held.toDate) {
      held.toDate = booked;
    }
  }

  return [...byStatement.values()];
}

/**
 * The balances the bank itself stated, as anchors (§4.4).
 *
 * Both ends of a statement count, and for the same reason: each is the bank
 * saying what the account held on a named day. The closing balance applies on
 * the statement's `toDate`; the opening balance applies on the day *before* its
 * `fromDate`, because "what there was before the first entry" is the balance at
 * the end of the previous day.
 *
 * A file that states neither produces no anchor at all, and an account with no
 * anchor has an Unknown balance rather than a fabricated one — which is §4.1.
 */
function bankAnchors(
  entries: AyqBankEntry[],
): Array<{ amountCents: number; coverageDate: string; kind: 'opening' | 'closing' }> {
  const found = new Map<string, { amountCents: number; kind: 'opening' | 'closing' }>();

  for (const entry of entries) {
    const statement = entry.statement;

    const closing = statement.closingBalance;
    const closesOn = statement.toDate?.slice(0, 10) ?? entry.bookingDate.date;
    if (closing && closing.value !== null && closesOn !== null) {
      found.set(closesOn, { amountCents: Math.round(closing.value * 100), kind: 'closing' });
    }

    const opening = statement.openingBalance;
    const opensOn = statement.fromDate?.slice(0, 10) ?? null;
    if (opening && opening.value !== null && opensOn !== null) {
      const dayBefore = ayqAddDays(opensOn, -1);
      if (!found.has(dayBefore)) {
        found.set(dayBefore, { amountCents: Math.round(opening.value * 100), kind: 'opening' });
      }
    }
  }

  return [...found.entries()]
    .map(([coverageDate, held]) => ({ coverageDate, ...held }))
    .sort((left, right) => (left.coverageDate < right.coverageDate ? -1 : 1));
}

/**
 * The account by that name, created if the budget has not seen it before.
 *
 * Created with no opening figure. Its technical starting balance is written by
 * `ayqReapplyAnchor` from this account's own earliest statement opening
 * (PF-006 F3) — the one path for it, so nothing can hand a new account an
 * opening balance read from another account's statements.
 */
async function accountFor(name: string): Promise<{ id: string; created: boolean }> {
  const existing = (await api.getAccounts()).find(
    account => account.name === name,
  );
  if (existing) return { id: existing.id, created: false };
  return { id: await api.createAccount({ name, offbudget: false }, 0), created: true };
}

function bankCode(entry: AyqBankEntry): string | null {
  const code = entry.bankTransactionCode;
  const parts = [code.domain, code.family, code.subFamily].filter(
    (part): part is string => typeof part === 'string' && part.length > 0,
  );
  return parts.length > 0 ? parts.join('/') : (code.proprietary ?? null);
}

/**
 * Reads, parses, maps and imports — then remembers.
 *
 * Deduplication is not done here: every mapped transaction carries an
 * `imported_id` (the bank's AcctSvcrRef when it gave one, the record's stable
 * key otherwise) and Actual matches on it. Repeats *within* one batch are
 * collapsed before sending, because Actual matches an import against the budget
 * and not against itself, and a ZIP of daily exports overlaps by construction.
 */
export async function ayqImportCamt(
  dataDir: string,
  paths: string[],
  budget: { budgetId: string; budgetName: string },
): Promise<AyqImportSummary> {
  if (paths.length === 0) throw new AyqEngineError('import-no-file', 'no file was chosen');

  // One unusable file does not abandon the others. Each is reported by name so
  // the person can see which one it was, and the readable ones still import.
  const { files, unreadable } = await ayqCollectTargets(paths);
  // The code crosses to the window; the camt package's English stays behind.
  const problems: AyqImportProblem[] = unreadable.map(one => ({
    name: one.name,
    code: one.code,
  }));

  const records: AyqBankEntry[] = [];
  for (const file of files) {
    try {
      const entries = await ayqParseCamt(file.content, { file: file.name });
      // Well-formed XML that is not a statement parses to nothing at all. That
      // is a file the person chose and AYQ could not use, so it is named like
      // any other, rather than disappearing into a total of zero.
      if (entries.length === 0) {
        problems.push({ name: file.name, code: 'no-entries' });
      }
      records.push(...entries);
    } catch {
      // Whatever the parser objected to would quote the document, and a
      // statement's contents do not belong in a message. The name does.
      problems.push({ name: file.name, code: 'not-camt' });
    }
  }

  // Nothing readable at all is a failure, not an import of nothing: the budget
  // is left exactly as it was and the person is told why, file by file.
  if (records.length === 0) {
    // Each file and its code go to the window, which words them; the detail
    // is for a log.
    throw new AyqEngineError(
      'import-nothing-readable',
      problems.length === 0
        ? 'none of the chosen files holds a CAMT document'
        : problems.map(problem => `${problem.name}: ${problem.code}`).join('; '),
      { files: paths.length },
      problems,
    );
  }

  const store = ayqReadStore(dataDir);
  const countBefore = await ayqTransactionCount();
  const createdAt = new Date().toISOString();

  // Line 1 of the counterparty precedence, applied where a name is first
  // decided: the automatic resolver says what it makes of the statement, and an
  // explicit alias for that key overrules it. Two things stay true because the
  // alias is applied here rather than inside the resolver — the provenance
  // written below records what the automatic layers decided, untouched, and a
  // future import of the same variant lands on the same counterparty as the
  // rows already in the budget, which are aliased when they are read.
  const aliases = ayqAliasMap(store);
  const provenance: Record<string, AyqProvenance> = {};
  const profiles: Record<string, AyqAccountProfile> = {};

  type AyqGroupImport = {
    name: string;
    entries: AyqBankEntry[];
    importId: string;
    accountId: string;
    created: boolean;
    prepared: number;
    skipped: number;
    imported: number;
    errors: number;
  };
  const done: AyqGroupImport[] = [];

  // PF-006 F1: every statement goes into the account its own IBAN names. A ZIP
  // of several accounts' statements is several imports into several accounts,
  // each with its own record, its own evidence and its own anchors — nothing
  // one account's statements say is ever written against another.
  for (const { name, entries } of ayqGroupByAccount(records)) {
    const importId = ayqId('import');
    const seen = new Set<string>();
    const transactions = [];
    let skipped = 0;

    for (const entry of entries) {
      const resolved = ayqResolveCounterparty(entry);
      const alias = resolved.key === null ? undefined : aliases.get(resolved.key);
      const counterparty =
        alias === undefined
          ? resolved
          : {
              ...resolved,
              name: alias.counterpartyName,
              key: alias.counterpartyKey,
              resolvedBy: 'alias' as const,
            };

      const transaction = ayqToActualTransaction(entry, counterparty);
      if (transaction === null) {
        skipped += 1;
        continue;
      }

      const key = transaction.imported_id;
      if (key !== undefined) {
        if (seen.has(key)) continue;
        seen.add(key);

        // What the automatic resolver decided, and only that. The alias above
        // changed which counterparty the transaction is filed under; it did not
        // change what the bank sent or what AYQ made of it unaided, and this
        // record is the evidence that lets the decision be read back or undone.
        provenance[key] = {
          importId,
          counterpartyKey: resolved.key,
          counterpartyName: resolved.name,
          resolvedBy: resolved.resolvedBy,
          kind: resolved.kind,
          counterpartyIban: resolved.iban,
          intermediary: resolved.intermediary,
          mandateId: resolved.mandateId,
          endToEndId: entry.references.endToEndId,
          bankTransactionCode: bankCode(entry),
          valueDate: entry.valueDate.date,
          description: transaction.imported_payee ?? null,
          file: entry.statement.file,
        };
      }

      transactions.push(transaction);
    }

    const { id: accountId, created } = await accountFor(name);
    // CL_001 D3: the kind is not guessed from the file. A new account starts
    // with the question waiting, and the owner is asked once.
    if (created) profiles[accountId] = ayqNewAccountProfile(statedCurrency(entries), createdAt);

    const result = await api.importTransactions(
      accountId,
      ayqWithAccount(transactions, accountId),
    );
    done.push({
      name,
      entries,
      importId,
      accountId,
      created,
      prepared: transactions.length,
      skipped,
      imported: result.added?.length ?? 0,
      errors: result.errors?.length ?? 0,
    });
  }

  // Written before the rules run: a rule reads the provenance to find out which
  // counterparty a transaction belongs to.
  store.provenance = { ...store.provenance, ...provenance };
  for (const [accountId, profile] of Object.entries(profiles)) {
    store.accountProfiles[accountId] ??= profile;
  }
  ayqWriteStore(dataDir, store);

  const { categorised } = await ayqApplyRules(dataDir);

  // Then whatever the owner has no rule for yet, filed from the evidence the
  // import just wrote (03 §11.12). It runs on every import and it runs over the
  // counterparties AYQ has never seen before, which is the point: a statement
  // full of new shops should not land as a queue of five hundred decisions.
  //
  // After the rules, never before: a rule is the owner's own generalisation and
  // outranks this, and running this first would only make work for it to undo.
  const { filed } = await ayqApplyFiling(dataDir);

  // And the expected payments meet what actually arrived (03 §7.3). Only the
  // clear ones are applied; the rest wait on the Upcoming screen. It runs here
  // because this is the moment new evidence exists — a person should not have
  // to remember to ask.
  const matched = await ayqRunMatching(
    dataDir,
    new Date().toISOString().slice(0, 10),
    new Date().toISOString(),
  );

  const at = new Date().toISOString();
  const file = paths.length === 1 ? basename(paths[0]) : `${paths.length} files`;
  const accountRecords: AyqImportRecord[] = [];
  const outcomes: AyqImportAccountOutcome[] = [];

  for (const [index, group] of done.entries()) {
    const first = index === 0;
    const { accountId, importId, entries } = group;
    // The whole import's own facts — the files it could not use, and what the
    // rules, the filing and the matching did over the budget — are told once,
    // on the first account's record, so the history does not count them twice.
    const record: AyqImportRecord = {
      id: importId,
      at,
      file,
      files: files.length,
      records: entries.length,
      prepared: group.prepared,
      imported: group.imported,
      // Everything the file held that did not become a new transaction: rows the
      // budget already had, and repeats within the file itself. Both are the same
      // thing to the person importing.
      duplicates: entries.length - group.skipped - group.imported,
      skipped: group.skipped,
      failed: (first ? problems.length : 0) + group.errors,
      problems: first ? problems : [],
      accountId,
      accountName: group.name,
      categorised: first ? categorised : 0,
      filed: first ? filed : 0,
      matched: first ? matched.applied : 0,
      matchesWaiting: first ? matched.proposals.length : 0,
      // Filled in below, once the anchors this file carried have been written and
      // the one that stands is known.
      balanceWanted: false,
      anchoredAt: null,
      anchorEstablished: false,
    };

    const after = ayqReadStore(dataDir);
    after.imports.push(record);

    // What this file proves about the account's movements (§6.2). Every interval
    // is kept, not just the furthest: an older statement imported to fill a gap
    // is exactly the evidence that closes the gap, and a store that keeps only
    // the boundary throws it away. Nothing here moves any boundary backwards
    // either — the union does that arithmetic where it belongs.
    const readAt = new Date().toISOString();
    after.evidence.push(
      ...coverageEvidence(entries, accountId, importId, readAt, group.name),
    );

    // And the balances the bank itself stated, as anchors (§4.4). Which of them
    // stands is `ayqActiveAnchor`'s question, not this one's: an older statement
    // imported later adds an older anchor and does not displace a newer one.
    const anchoredBefore = ayqActiveAnchor(after, accountId);
    for (const stated of bankAnchors(entries)) {
      const already = after.anchors.some(
        one =>
          one.accountId === accountId &&
          one.source === 'bank' &&
          one.coverageDate === stated.coverageDate &&
          one.amountCents === stated.amountCents,
      );
      // Importing the same statement twice must not write the same anchor twice:
      // duplicates are to have zero effect (§4.3), and an anchor history full of
      // identical rows is provenance nobody can read.
      if (already) continue;
      after.anchors.push({
        id: ayqId('anchor'),
        accountId,
        amountCents: stated.amountCents,
        coverageDate: stated.coverageDate,
        importId,
        source: 'bank',
        createdAt: readAt,
        kind: stated.kind,
      });
    }
    ayqWriteStore(dataDir, after);

    // §4.3 and PF-006 F3: the technical starting balance is this account's own
    // earliest statement opening, and it is written again after every import —
    // an older statement moves it back, a newer one leaves it and adds its
    // movements. None of it runs when the account has no anchor, because then
    // there is nothing to build the row on.
    await ayqReapplyAnchor(dataDir, accountId);

    // Whether the import left the owner anything to do about the balance (§4.4):
    // no reliable bank figure, and no anchor from before either.
    const settled = ayqReadStore(dataDir);
    const anchorAfter = ayqActiveAnchor(settled, accountId);
    record.balanceWanted = anchorAfter === null;
    record.anchoredAt = anchorAfter?.coverageDate ?? null;
    if (anchoredBefore === null && anchorAfter !== null) {
      record.anchorEstablished = true;
    }
    const position = settled.imports.findIndex(one => one.id === importId);
    if (position >= 0) {
      settled.imports[position] = record;
      ayqWriteStore(dataDir, settled);
    }

    accountRecords.push(record);
    outcomes.push({
      importId,
      accountId,
      accountName: group.name,
      created: group.created,
      records: record.records,
      imported: record.imported,
      duplicates: record.duplicates,
      balanceWanted: record.balanceWanted,
      anchoredAt: record.anchoredAt,
      anchorEstablished: record.anchorEstablished,
      kindWanted: ayqKindWanted(settled, accountId),
    });
  }

  const total = (pick: (one: AyqImportRecord) => number): number =>
    accountRecords.reduce((sum, one) => sum + pick(one), 0);
  const wanting = accountRecords.find(one => one.balanceWanted) ?? accountRecords[0];
  const imported = total(one => one.imported);

  return {
    // The import as a whole, for the line the screen says after it. Each
    // account's own record is in the history, and in `accounts` below.
    id: accountRecords[0].id,
    at,
    file,
    files: files.length,
    records: total(one => one.records),
    prepared: total(one => one.prepared),
    imported,
    duplicates: total(one => one.duplicates),
    skipped: total(one => one.skipped),
    failed: total(one => one.failed),
    problems,
    accountId: accountRecords[0].accountId,
    accountName: accountRecords.map(one => one.accountName).join(', '),
    categorised,
    filed,
    matched: matched.applied,
    matchesWaiting: matched.proposals.length,
    balanceWanted: accountRecords.some(one => one.balanceWanted),
    anchoredAt: wanting.anchoredAt,
    anchorEstablished: accountRecords.some(one => one.anchorEstablished),
    accounts: outcomes,
    budgetId: budget.budgetId,
    budgetName: budget.budgetName,
    // The import lands after `importTransactions` resolves, so the count is
    // only believed once it shows every row that was added.
    transactionCountAfter: await ayqSettle(
      ayqTransactionCount,
      count => count >= countBefore + imported,
      'the imported transactions',
    ),
  };
}

export function ayqImports(dataDir: string): AyqImportRecord[] {
  // Newest first: an import history is read to answer "did that go in?".
  return [...ayqReadStore(dataDir).imports].reverse();
}
