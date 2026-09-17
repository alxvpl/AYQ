// The counterparty name a store written before build 006 never recorded.
//
// ## What went wrong
//
// Build 006 made two things depend on `provenance.counterpartyName`: reading a
// stored key again under the widened §3.9 rule, and filing a transaction from
// the counterparty the resolver pronounced (§11.10). Both were proved on
// budgets the same build had just imported, where that field is always there.
//
// It is not there in any budget imported before build 006. The owner's store
// held five hundred and sixty-seven records and not one of them carried a name,
// so on his budget build 007 folded nothing and filed nothing but the thirteen
// bank charges — those are decided from the payment class and need no name. The
// two things he asked for both silently did nothing, on the only budget that
// mattered.
//
// ## What is recovered, and from what
//
// `description` is what the bank actually wrote, verbatim, and every record has
// it. It is the same text the importer's own resolver read, so the name is
// recovered by running the same two parsers over the same input — not by
// inventing a rule that happens to fit.
//
// A name that cannot be recovered stays absent, because a record whose name
// came from a structured XML field (`Cdtr/Nm`) never put it in the description
// and there is nothing in the store to recover it from. Those records still
// carry their key, and `ayqApplyFiling` reads that instead.
//
// ## Why this is not rewriting evidence
//
// §3.8 forbids rewriting the key the resolver decided, and nothing here touches
// a key. The raw description is not touched either. What is written is the name
// that description already contained — a field left blank is filled in, and a
// record that has one is never overwritten. Run it twice and the second run
// changes nothing.

import {
  ayqParseCardDescription,
  ayqParseSepaDescription,
} from '../../ayq-camt/src/counterparty/ayq-description.ts';

import type { AyqStore } from './ayq-store.ts';

/**
 * Fills in the counterparty name wherever provenance has none.
 *
 * Mutates `store` and answers how many records gained a name, so the caller can
 * decide whether there is anything to write.
 */
export function ayqRecoverCounterpartyNames(store: AyqStore): number {
  let recovered = 0;

  for (const provenance of Object.values(store.provenance)) {
    if (provenance.counterpartyName) continue;

    const name = nameIn(provenance.description, provenance.intermediary);
    if (name === null) continue;

    provenance.counterpartyName = name;
    recovered += 1;
  }

  return recovered;
}

/**
 * The name the resolver would have pronounced from this description.
 *
 * The order is the resolver's own: a card terminal's text first, then a SEPA
 * transfer's. Behind an intermediary the name in the text is the payment
 * provider's and the merchant sits in the remittance, which is the one case
 * where the two disagree — provenance recorded which it was, so it is read
 * rather than guessed at.
 */
function nameIn(
  description: string | null,
  intermediary: string | null,
): string | null {
  const card = ayqParseCardDescription(description);
  if (card?.merchant) return card.merchant;

  const sepa = ayqParseSepaDescription(description);
  if (sepa === null) return null;

  return (intermediary !== null ? sepa.remittance : sepa.name) ?? null;
}
