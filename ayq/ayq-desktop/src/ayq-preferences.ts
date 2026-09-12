// What the owner chose about the interface, kept where everything else AYQ
// keeps things: beside the budget, in the AYQ store.
//
// The renderer has no disk (02 §3.1), so a choice made in the window travels
// out over the contract and comes back on the next launch. That is the whole
// of 04 A23's "the setting is the owner's": it is remembered, and it is
// remembered per budget, because the budget is what a person opens.

import type { AyqSettings } from '../../ayq-client/src/ayq-ipc-contract.ts';

import {
  ayqNormaliseSettings,
  ayqReadStore,
  ayqWriteStore,
} from './ayq-store.ts';

export function ayqSettings(dataDir: string): AyqSettings {
  return ayqReadStore(dataDir).settings;
}

/**
 * Records a choice and hands back what was stored.
 *
 * What is returned is read out of the store rather than echoed from the
 * request, so a value this AYQ would not accept comes back corrected instead
 * of being shown as though it had been kept.
 */
export function ayqSaveSettings(
  dataDir: string,
  settings: AyqSettings,
): AyqSettings {
  const store = ayqReadStore(dataDir);
  store.settings = ayqNormaliseSettings(settings);
  ayqWriteStore(dataDir, store);
  return store.settings;
}
