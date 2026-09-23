// Merging one counterparty into another (04 A37; 03 §3.6, §3.11).
//
// A merge is not a new kind of decision. It is every statement variant of one
// counterparty being said, explicitly, to be another — one alias per variant,
// written by the same function a single "this one is really that" uses. That
// is what makes it reversible in the only way the Canon allows: by a further
// identity correction, removing those aliases one at a time on the surviving
// counterparty's page. Nothing is deleted; every transaction moves and every
// record stays.
//
// A merge never speaks for a category. A rule keyed on the merged counterparty
// follows the alias rules that already exist — it moves to the survivor where
// the survivor has none, and goes where it has one — and the answer counts
// both so that the screen can say what happened.

import type { AyqCounterpartyMerged } from '../../ayq-client/src/ayq-ipc-contract.ts';

import { ayqApplyAliases, ayqRememberAlias } from './ayq-aliases.ts';
import { ayqCounterpartyDetail } from './ayq-counterparties.ts';
import { ayqApplyRules } from './ayq-rules.ts';
import { ayqReadStore } from './ayq-store.ts';
import { AyqEngineError } from './ayq-error.ts';

export async function ayqMergeCounterparty(
  dataDir: string,
  counterpartyKey: string,
  intoKey: string,
): Promise<AyqCounterpartyMerged> {
  if (counterpartyKey === intoKey) {
    throw new AyqEngineError('counterparty-self', 'a counterparty cannot be merged into itself');
  }
  const from = await ayqCounterpartyDetail(dataDir, counterpartyKey);
  const into = await ayqCounterpartyDetail(dataDir, intoKey);
  if (into.counterparty.transactions === 0) {
    throw new AyqEngineError(
      'counterparty-not-found',
      'no counterparty in this budget has that key; a merge points at one ' +
        'that exists',
    );
  }
  if (from.variants.length === 0) {
    throw new AyqEngineError(
      'merge-nothing',
      'nothing to merge: no statement variant resolves to that counterparty',
    );
  }

  const rulesBefore = ayqReadStore(dataDir).rules.length;
  const rulesOfFrom = from.rules.length;

  // One explicit identity decision per variant, in the order the detail lists
  // them, so that what was already moved in by hand is re-pointed too.
  for (const variant of from.variants) {
    ayqRememberAlias(dataDir, {
      variantKey: variant.key,
      variant: variant.names[0] ?? variant.key,
      counterpartyKey: intoKey,
      counterpartyName: into.counterparty.name,
    });
  }
  const { moved } = await ayqApplyAliases(dataDir);
  // The survivor may have a rule the newcomers were never filed under; applying
  // keeps the standing limit — never a transaction filed by hand.
  await ayqApplyRules(dataDir);

  const rulesRemoved = rulesBefore - ayqReadStore(dataDir).rules.length;
  const survivor = await ayqCounterpartyDetail(dataDir, intoKey);
  return {
    counterpartyKey: intoKey,
    counterpartyName: survivor.counterparty.name,
    variants: from.variants.length,
    moved,
    rulesMoved: Math.max(0, rulesOfFrom - rulesRemoved),
    rulesRemoved,
  };
}
