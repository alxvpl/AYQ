// Settings.
//
// Six surfaces, and each owns its question outright: which accounts count
// toward available funds (03 §7.6), the categories (the only place they are
// created, renamed, grouped or archived), the rules that will act from now on
// (04 A7), the ground the window is drawn in (A23), backing up and restoring
// the whole of it (A38), and which build this is (12 §12).
//
// About is a tab here and nowhere else. It is not a rail destination, and the
// version and build number it carries appear on no other screen — a product
// that stamps its build number across its own chrome is a product that thinks
// its build number is a feature.
//
// Each section is drawn as template r003 draws one: its name and what it is
// for at the top, then its panes, on a body no wider than 980.

import { useState } from 'react';
import type { ReactNode } from 'react';

import { makeStyles } from '@fluentui/react-components';

import { ayqText } from '../ayq-strings.ts';
import type { AyqStringKey } from '../ayq-strings.ts';
import { AYQ_METRIC, AYQ_TYPE } from '../ayq-tokens.ts';
import { ayqBorderTop } from '../ayq-ui/ayq-css.ts';
import { AyqScreenActionsContext } from '../ayq-ui/ayq-screen.tsx';

import { AyqAboutScreen } from './ayq-about.tsx';
import { AyqAppearanceScreen } from './ayq-appearance.tsx';
import { AyqSettingsAccounts } from './ayq-settings-accounts.tsx';
import { AyqSettingsBackup } from './ayq-settings-backup.tsx';
import { AyqSettingsCategories } from './ayq-settings-categories.tsx';
import { AyqSettingsRules } from './ayq-settings-rules.tsx';

export type AyqSettingsTab =
  | 'accounts'
  | 'categories'
  | 'rules'
  | 'appearance'
  | 'backup'
  | 'about';

export const AYQ_SETTINGS_TABS: readonly {
  id: AyqSettingsTab;
  key: AyqStringKey;
}[] = [
  { id: 'appearance', key: 'settings.tab.appearance' },
  { id: 'accounts', key: 'settings.tab.accounts' },
  { id: 'categories', key: 'settings.tab.categories' },
  { id: 'rules', key: 'settings.tab.rules' },
  { id: 'backup', key: 'settings.tab.backup' },
  { id: 'about', key: 'settings.tab.about' },
];

const BLURB: Record<AyqSettingsTab, AyqStringKey> = {
  appearance: 'appearance.blurb',
  accounts: 'settings.accounts.blurb',
  categories: 'settings.categories.blurb',
  rules: 'rules.blurb',
  backup: 'settings.backup.blurb',
  about: 'settings.about.blurb',
};

const useStyles = makeStyles({
  body: {
    maxWidth: '980px',
    display: 'flex',
    flexDirection: 'column',
    gap: `${AYQ_METRIC.splitGap}px`,
  },
  head: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: `${AYQ_METRIC.space.screen}px`,
    marginBottom: '6px',
  },
  title: {
    fontFamily: 'var(--ayq-font-display)',
    fontSize: 'var(--ayq-size-screen)',
    fontWeight: AYQ_TYPE.weight.semibold,
    margin: '0 0 3px',
    color: 'var(--ayq-ink)',
  },
  sub: {
    margin: '0',
    fontSize: 'var(--ayq-size-small)',
    color: 'var(--ayq-ink-faint)',
  },
  toolbar: {
    display: 'flex',
    gap: `${AYQ_METRIC.space.medium}px`,
    alignItems: 'center',
  },
  // A setting row: the name and its note on the left, the control on the right.
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: `${AYQ_METRIC.space.screen}px`,
    padding: `${AYQ_METRIC.space.wide}px 0`,
    ...ayqBorderTop('var(--ayq-section)'),
    ':first-child': { borderTopWidth: '0', paddingTop: '0' },
    ':last-child': { paddingBottom: '0' },
  },
  rowName: { fontWeight: AYQ_TYPE.weight.semibold, color: 'var(--ayq-ink)' },
  rowNote: {
    fontSize: 'var(--ayq-size-small)',
    color: 'var(--ayq-ink-faint)',
    marginTop: '2px',
  },
  rowControl: {
    display: 'flex',
    gap: `${AYQ_METRIC.space.medium}px`,
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  paneBody: { padding: `${AYQ_METRIC.panePadding}px` },
});

/** One row of a settings pane, as template r003 draws it. */
export function AyqSettingRow({
  name,
  note,
  children,
  mark,
}: {
  name: ReactNode;
  note?: ReactNode;
  children?: ReactNode;
  mark?: string;
}): ReactNode {
  const styles = useStyles();
  return (
    <div className={styles.row} data-ayq-setting-row={mark}>
      <div>
        <div className={styles.rowName}>{name}</div>
        {note === undefined ? null : (
          <div className={styles.rowNote}>{note}</div>
        )}
      </div>
      <div className={styles.rowControl}>{children}</div>
    </div>
  );
}

/** The body of a settings pane: rows on the pane's padding. */
export function AyqSettingBody({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const styles = useStyles();
  return <div className={styles.paneBody}>{children}</div>;
}

export function AyqSettingsScreen({
  tab,
  onFailure,
  onChanged,
  onOpenAccounts,
  onOpenAccount,
}: {
  tab: AyqSettingsTab;
  onFailure(message: string): void;
  onChanged(): void;
  onOpenAccounts(): void;
  onOpenAccount(accountId: string): void;
}): ReactNode {
  const styles = useStyles();
  const label = AYQ_SETTINGS_TABS.find(one => one.id === tab)?.key;
  // A section's own actions go at the right of its name, through the same
  // slot a screen's do.
  const [host, setHost] = useState<HTMLElement | null>(null);

  let section: ReactNode;
  if (tab === 'appearance') {
    section = <AyqAppearanceScreen />;
  } else if (tab === 'backup') {
    section = <AyqSettingsBackup onFailure={onFailure} onChanged={onChanged} />;
  } else if (tab === 'about') {
    section = <AyqAboutScreen onFailure={onFailure} />;
  } else if (tab === 'accounts') {
    section = (
      <AyqSettingsAccounts
        onFailure={onFailure}
        onChanged={onChanged}
        onOpenAccounts={onOpenAccounts}
        onOpenAccount={onOpenAccount}
      />
    );
  } else if (tab === 'rules') {
    section = <AyqSettingsRules onFailure={onFailure} onChanged={onChanged} />;
  } else {
    section = (
      <AyqSettingsCategories onFailure={onFailure} onChanged={onChanged} />
    );
  }

  return (
    <AyqScreenActionsContext.Provider value={host}>
    <div className={styles.body} data-ayq-settings={tab}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>
            {label === undefined ? '' : ayqText(label)}
          </h1>
          <p className={styles.sub}>{ayqText(BLURB[tab])}</p>
        </div>
        <div className={styles.toolbar} ref={setHost} data-ayq-settings-actions="" />
      </div>
      {section}
    </div>
    </AyqScreenActionsContext.Provider>
  );
}
