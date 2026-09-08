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

import type {
  AyqImportRecord,
  AyqImportSummary,
  AyqProvenance,
} from '../../ayq-client/src/ayq-ipc-contract.ts';
import { ayqParseCamt } from '../../ayq-camt/src/ayq-camt053.ts';
import { ayqLoadTargets } from '../../ayq-camt/src/ayq-files.ts';
import type { AyqBankEntry } from '../../ayq-camt/src/ayq-types.ts';
import { ayqResolveCounterparty } from '../../ayq-camt/src/counterparty/ayq-resolve.ts';
import { ayqToActualTransaction } from '../../ayq-actual-bridge/src/ayq-actual-transaction.ts';
import { ayqWithAccount } from '../../ayq-actual-bridge/src/ayq-prepare.ts';
import { ayqApplyRules } from './ayq-rules.ts';
import { ayqSettle } from './ayq-settle.ts';
import { ayqId, ayqReadStore, ayqWriteStore } from './ayq-store.ts';
import { ayqTransactionCount } from './ayq-ledger.ts';

/**
 * The name the imported account gets, masked.
 *
 * An IBAN identifies a person's account, and this name travels into the
 * interface, into screenshots and into CI logs. A country code and the last
 * four are enough to tell two accounts apart and to recognise your own; the
 * rest never leaves the record. The masking is deterministic, which is what
 * makes a second import land in the same account rather than a new one.
 */
export function ayqMaskAccount(entries: AyqBankEntry[]): string {
  for (const entry of entries) {
    const iban = entry.statement.accountIban;
    if (iban !== null && iban.length >= 6) {
      return `AYQ ${iban.slice(0, 2)}…${iban.slice(-4)}`;
    }
  }
  return 'AYQ imported account';
}

/** The account by that name, created if the budget has not seen it before. */
async function accountFor(name: string): Promise<string> {
  const existing = (await api.getAccounts()).find(
    account => account.name === name,
  );
  if (existing) return existing.id;
  return api.createAccount({ name, offbudget: false }, 0);
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
  if (paths.length === 0) throw new Error('no file was chosen');

  const files = await ayqLoadTargets(paths);
  if (files.length === 0) {
    throw new Error(
      paths.length === 1
        ? 'that file holds no CAMT document'
        : 'none of those files holds a CAMT document',
    );
  }

  const records: AyqBankEntry[] = [];
  let failed = 0;
  for (const file of files) {
    try {
      records.push(...(await ayqParseCamt(file.content, { file: file.name })));
    } catch {
      // The reason would quote the document. The count is what travels.
      failed += 1;
    }
  }

  const importId = ayqId('import');
  const store = ayqReadStore(dataDir);

  const seen = new Set<string>();
  const transactions = [];
  const provenance: Record<string, AyqProvenance> = {};
  let skipped = 0;

  for (const entry of records) {
    const counterparty = ayqResolveCounterparty(entry);
    const transaction = ayqToActualTransaction(entry, counterparty);
    if (transaction === null) {
      skipped += 1;
      continue;
    }

    const key = transaction.imported_id;
    if (key !== undefined) {
      if (seen.has(key)) continue;
      seen.add(key);

      provenance[key] = {
        importId,
        counterpartyKey: counterparty.key,
        resolvedBy: counterparty.resolvedBy,
        kind: counterparty.kind,
        counterpartyIban: counterparty.iban,
        intermediary: counterparty.intermediary,
        mandateId: counterparty.mandateId,
        endToEndId: entry.references.endToEndId,
        bankTransactionCode: bankCode(entry),
        valueDate: entry.valueDate.date,
        description: transaction.imported_payee ?? null,
        file: entry.statement.file,
      };
    }

    transactions.push(transaction);
  }

  const accountName = ayqMaskAccount(records);
  const accountId = await accountFor(accountName);
  const countBefore = await ayqTransactionCount();

  const result = await api.importTransactions(
    accountId,
    ayqWithAccount(transactions, accountId),
  );
  const imported = result.added?.length ?? 0;
  const errors = result.errors?.length ?? 0;

  // Written before the rules run: a rule reads the provenance to find out which
  // counterparty a transaction belongs to.
  store.provenance = { ...store.provenance, ...provenance };
  ayqWriteStore(dataDir, store);

  const { categorised } = await ayqApplyRules(dataDir);

  const record: AyqImportRecord = {
    id: importId,
    at: new Date().toISOString(),
    file:
      paths.length === 1
        ? basename(paths[0])
        : `${paths.length} files`,
    files: files.length,
    records: records.length,
    prepared: transactions.length,
    imported,
    // Everything the file held that did not become a new transaction: rows the
    // budget already had, and repeats within the file itself. Both are the same
    // thing to the person importing.
    duplicates: records.length - skipped - imported,
    skipped,
    failed: failed + errors,
    accountId,
    accountName,
    categorised,
  };

  const after = ayqReadStore(dataDir);
  after.imports.push(record);
  ayqWriteStore(dataDir, after);

  return {
    ...record,
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
