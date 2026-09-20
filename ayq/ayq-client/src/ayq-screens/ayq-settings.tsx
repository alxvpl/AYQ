// Settings.
//
// Six surfaces, and each owns its question outright: which accounts count
// toward available funds (03 §7.6), the categories (the only place they are
// created, renamed, grouped or archived), the rules that will act from now on
// (04 A7), the ground the window is drawn in (A23), what AYQ writes out for
// AYQ Analyses (03 §13), and which build this is (12 §12).
//
// About is a tab here and nowhere else. It is not a rail destination, and the
// version and build number it carries appear on no other screen — a product
// that stamps its build number across its own chrome is a product that thinks
// its build number is a feature.

import type { ReactNode } from 'react';

import { type AyqStringKey } from '../ayq-strings.ts';
import { AyqAboutScreen } from './ayq-about.tsx';
import { AyqAppearanceScreen } from './ayq-appearance.tsx';
import { AyqSettingsAccounts } from './ayq-settings-accounts.tsx';
import { AyqSettingsCategories } from './ayq-settings-categories.tsx';
import { AyqSettingsData } from './ayq-settings-data.tsx';
import { AyqSettingsRules } from './ayq-settings-rules.tsx';

export type AyqSettingsTab =
  | 'accounts'
  | 'categories'
  | 'rules'
  | 'appearance'
  | 'data'
  | 'about';

export const AYQ_SETTINGS_TABS: readonly {
  id: AyqSettingsTab;
  key: AyqStringKey;
}[] = [
  { id: 'accounts', key: 'settings.tab.accounts' },
  { id: 'categories', key: 'settings.tab.categories' },
  { id: 'rules', key: 'settings.tab.rules' },
  { id: 'appearance', key: 'settings.tab.appearance' },
  { id: 'data', key: 'settings.tab.data' },
  { id: 'about', key: 'settings.tab.about' },
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

  if (tab === 'about') return <AyqAboutScreen onFailure={onFailure} />;

  if (tab === 'data') return <AyqSettingsData onFailure={onFailure} />;

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
