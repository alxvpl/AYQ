// Settings.
//
// Four surfaces, and each owns its question outright: which accounts count
// toward available funds (03 §7.6), the categories (the only place they are
// created, renamed, grouped or archived), the rules that will act from now on
// (04 A7), and the ground the window is drawn in (A23).
//
// All four are built.

import type { ReactNode } from 'react';

import { type AyqStringKey } from '../ayq-strings.ts';
import { AyqAppearanceScreen } from './ayq-appearance.tsx';
import { AyqSettingsAccounts } from './ayq-settings-accounts.tsx';
import { AyqSettingsCategories } from './ayq-settings-categories.tsx';
import { AyqSettingsRules } from './ayq-settings-rules.tsx';

export type AyqSettingsTab = 'accounts' | 'categories' | 'rules' | 'appearance';

export const AYQ_SETTINGS_TABS: readonly {
  id: AyqSettingsTab;
  key: AyqStringKey;
}[] = [
  { id: 'accounts', key: 'settings.tab.accounts' },
  { id: 'categories', key: 'settings.tab.categories' },
  { id: 'rules', key: 'settings.tab.rules' },
  { id: 'appearance', key: 'settings.tab.appearance' },
];

export function AyqSettingsScreen({
  tab,
  onFailure,
  onChanged,
  onOpenAccounts,
}: {
  tab: AyqSettingsTab;
  onFailure(message: string): void;
  onChanged(): void;
  onOpenAccounts(): void;
}): ReactNode {
  if (tab === 'appearance') return <AyqAppearanceScreen />;

  if (tab === 'accounts') {
    return (
      <AyqSettingsAccounts
        onFailure={onFailure}
        onChanged={onChanged}
        onOpenAccounts={onOpenAccounts}
      />
    );
  }

  if (tab === 'rules') {
    return <AyqSettingsRules onFailure={onFailure} onChanged={onChanged} />;
  }

  return <AyqSettingsCategories onFailure={onFailure} onChanged={onChanged} />;
}
