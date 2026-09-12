// The screens that have not been brought over to Fluent yet.
//
// They are the imperative renderers the application has always used, with what
// they need to be loaded and drawn. Nothing here is new work: it is the old
// shell's loading and drawing, lifted out of the shell so that the new one
// (04 A20) can host them while each is replaced in its own stage.
//
// Every one of them goes, and this file with them.

import { ayqAsk } from './ayq-bridge.ts';
import type {
  AyqCategory,
  AyqCategoryRule,
  AyqImportRecord,
  AyqLedgerFilter,
} from './ayq-ipc-contract.ts';
import {
  ayqEmptyCounterpartiesState,
  ayqRenderCounterparties,
  type AyqCounterpartiesState,
} from './ayq-counterparties.ts';
import { ayqRenderImports, ayqRenderRules } from './ayq-other-views.ts';

export type AyqLegacyView = 'imports' | 'counterparties' | 'rules';

type AyqLegacyState = {
  /** Shared by the screens that offer a category picker. */
  categories: AyqCategory[];
  counterparties: AyqCounterpartiesState;
  rules: AyqCategoryRule[];
  imports: AyqImportRecord[];
};

export const ayqLegacyState: AyqLegacyState = {
  categories: [],
  counterparties: ayqEmptyCounterpartiesState(),
  rules: [],
  imports: [],
};

/** Asks the engine, and turns a refusal into an exception with its words. */
async function need<K extends Parameters<typeof ayqAsk>[0]['kind']>(
  body: Parameters<typeof ayqAsk>[0] & { kind: K },
): Promise<Extract<Awaited<ReturnType<typeof ayqAsk>>, { ok: true; kind: K }>> {
  const answer = await ayqAsk(body);
  if (!answer.ok) throw new Error(answer.message);
  if (answer.kind !== body.kind) {
    throw new Error('the engine answered a different request');
  }
  return answer as Extract<
    Awaited<ReturnType<typeof ayqAsk>>,
    { ok: true; kind: K }
  >;
}

/**
 * How a screen asks the shell to open the Register on something.
 *
 * The shell owns which destination is open; a screen that wants another one is
 * making a request, not navigating.
 */
let openRegister: (filter: AyqLedgerFilter) => void = () => {};

export function ayqOnOpenRegister(open: (filter: AyqLedgerFilter) => void): void {
  openRegister = open;
}

/** Opens the Register on one counterparty. */
export function ayqLegacyOpenCounterparty(counterpartyKey: string): void {
  openRegister({ counterpartyKey });
}

async function categories(): Promise<void> {
  if (ayqLegacyState.categories.length > 0) return;
  ayqLegacyState.categories = (await need({ kind: 'categories.list' })).result;
}

export async function ayqLoadLegacy(view: AyqLegacyView): Promise<void> {
  switch (view) {
    case 'counterparties':
      ayqLegacyState.counterparties.list = (
        await need({
          kind: 'counterparties.list',
          filter: ayqLegacyState.counterparties.filter,
        })
      ).result;
      return;

    case 'rules':
      ayqLegacyState.rules = (await need({ kind: 'rules.list' })).result;
      await categories();
      return;

    case 'imports':
      ayqLegacyState.imports = (await need({ kind: 'imports.list' })).result;
      return;
  }
}

export function ayqDrawLegacy(
  view: AyqLegacyView,
  target: HTMLElement,
  reload: () => void,
): void {
  switch (view) {
    case 'counterparties':
      ayqRenderCounterparties(
        ayqLegacyState.counterparties,
        target,
        () => reload(),
        key => ayqLegacyOpenCounterparty(key),
      );
      return;
    case 'rules':
      ayqRenderRules(
        ayqLegacyState.rules,
        ayqLegacyState.categories,
        target,
        () => reload(),
      );
      return;
    case 'imports':
      ayqRenderImports(ayqLegacyState.imports, target);
      return;
  }
}
