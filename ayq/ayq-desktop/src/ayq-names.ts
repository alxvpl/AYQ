// What a counterparty is called on the screen — one answer, in one place.
//
// Three different things can want to name the same counterparty and they are
// not interchangeable:
//
//   the owner's own decision   "call this Maas"
//   AYQ's canonical name       what the resolver made of the bank's string,
//                              with any alias applied
//   the budget's payee         whatever Actual happens to hold on the row
//
// 8 §8.2 fixes the precedence, and this module is the only implementation of
// it. Every surface that names a counterparty — Register, Review, Plan,
// Upcoming, Reports — calls through here, which is what makes "the owner set
// Maas and it says Maas everywhere" a property of the code rather than a list
// of screens somebody has to remember to update.
//
// ## What a rename is not
//
// It does not change the canonical key. It does not move a category rule, which
// is keyed on that key. It does not merge two counterparties — that is an
// alias, and an alias is a different decision with different consequences. And
// it does not touch what the bank sent: the raw string stays in provenance and
// stays inspectable in the transaction detail, because it is the evidence the
// name was derived from and a name the owner chose is not evidence of anything.
//
// ## Why later imports cannot overwrite it
//
// Because it is not stored in the budget. The importer writes Actual's payee
// from the resolver and always will; the owner's name is kept beside the budget
// and applied when the ledger is *read*. There is no write for a later import
// to win.

import type {
  AyqCounterpartyNameDecision,
  AyqStore,
} from './ayq-store.ts';

import { ayqWriteStore, ayqReadStore } from './ayq-store.ts';

/**
 * The name to show for one counterparty. 8 §8.2, in order.
 *
 * `fallback` is line 3: the payee Actual holds for a transaction AYQ has no
 * provenance for, which is the only name that exists for a row AYQ did not
 * import. A null key means there is no counterparty to have an opinion about,
 * so the fallback is the whole answer.
 */
export function ayqDisplayName(
  store: AyqStore,
  canonicalKey: string | null | undefined,
  fallback: string | null,
): string | null {
  if (!canonicalKey) return fallback;
  const decided = store.counterpartyNames[canonicalKey];
  if (decided !== undefined && decided.displayName.trim() !== '') {
    return decided.displayName;
  }
  return fallback;
}

/** Every owner naming decision, so a caller can resolve a list in one pass. */
export function ayqNameDecisions(
  store: AyqStore,
): Map<string, AyqCounterpartyNameDecision> {
  return new Map(Object.entries(store.counterpartyNames));
}

/**
 * Records what the owner calls one counterparty, or clears the decision.
 *
 * An empty name is a removal rather than a counterparty called nothing: it puts
 * the automatic name back, which is the only sensible reading of a person
 * clearing the field.
 */
export function ayqSetDisplayName(
  dataDir: string,
  counterpartyKey: string,
  displayName: string,
): AyqCounterpartyNameDecision | null {
  const trimmed = displayName.trim();
  const store = ayqReadStore(dataDir);

  if (trimmed === '') {
    delete store.counterpartyNames[counterpartyKey];
    ayqWriteStore(dataDir, store);
    return null;
  }

  const decision: AyqCounterpartyNameDecision = {
    counterpartyKey,
    displayName: trimmed,
    decidedAt: new Date().toISOString(),
  };
  store.counterpartyNames[counterpartyKey] = decision;
  ayqWriteStore(dataDir, store);
  return decision;
}

/**
 * What happens to owner names when one counterparty is merged into another
 * (8 §8.4).
 *
 * The target's own name wins, because the owner chose it for the counterparty
 * that is going to survive. Where the target has none and the variant does, the
 * variant's name is carried across rather than dropped — the owner named that
 * shop, and the shop is still there; only its key has changed.
 *
 * The variant's decision is left in place either way. It costs a line in a JSON
 * file, it is the record of a decision that was really made, and removing an
 * alias has to be able to put things back.
 */
export function ayqCarryNameOnMerge(
  store: AyqStore,
  variantKey: string,
  targetKey: string,
): void {
  if (store.counterpartyNames[targetKey] !== undefined) return;
  const fromVariant = store.counterpartyNames[variantKey];
  if (fromVariant === undefined) return;
  store.counterpartyNames[targetKey] = {
    ...fromVariant,
    counterpartyKey: targetKey,
  };
}
