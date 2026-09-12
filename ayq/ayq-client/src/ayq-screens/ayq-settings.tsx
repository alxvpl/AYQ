// Settings.
//
// Four surfaces, and each owns its question outright: which accounts count
// toward available funds (03 §7.6), the categories (the only place they are
// created, renamed, grouped or archived), the rules that will act from now on
// (04 A7), and the ground the window is drawn in (A23).
//
// Two of them are later stages and say so rather than pretending.

import type { ReactNode } from 'react';

import { ayqText, type AyqStringKey } from '../ayq-strings.ts';
import { AyqLegacyScreen } from '../ayq-ui/ayq-legacy-screen.tsx';
import { AyqPane } from '../ayq-ui/ayq-pane.tsx';
import { AyqAppearanceScreen } from './ayq-appearance.tsx';
import { AyqNotBuilt } from './ayq-not-built.tsx';

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
}: {
  tab: AyqSettingsTab;
  onFailure(message: string): void;
}): ReactNode {
  if (tab === 'appearance') return <AyqAppearanceScreen />;

  if (tab === 'rules') {
    return (
      <AyqPane mark="rules">
        <div style={{ padding: '14px' }}>
          <AyqLegacyScreen view="rules" onFailure={onFailure} />
        </div>
      </AyqPane>
    );
  }

  return (
    <AyqNotBuilt
      what={ayqText(
        tab === 'accounts'
          ? 'notBuilt.settingsAccounts'
          : 'notBuilt.settingsCategories',
      )}
    />
  );
}
