// AYQ Analyses — the Settings utility surface (DS r007 §11).
//
// Two sections. Snapshot: which one is held, when it was taken, how much it
// holds — by name, age and counts, never by a path, a snapshot identifier, a
// budget key, an account key or a producer commit — and the two acts the
// owner can perform on it: load another, remove this one. About: the product,
// release and legal identity of this build (06_RELEASE r004 §3.11), its
// version and build read from the one release-metadata source (release.ts),
// and the way to the third-party notices.

import type { JSX } from 'react';
import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
} from '@fluentui/react-components';
import { formatDateTime, formatRelative } from '../format.js';
import { RELEASE, type ReleaseIdentity } from '../release.js';
import { useLocale, useText } from './text.js';
import type { SnapshotIdentity } from '../preload.js';
import type { AyqAnalyticalSnapshot } from '../types.js';

export type SettingsSnapshot =
  | { kind: 'none' }
  | { kind: 'refused'; identity: SnapshotIdentity }
  | { kind: 'loaded'; snapshot: AyqAnalyticalSnapshot; identity: SnapshotIdentity };

type SettingsViewProps = {
  active: SettingsSnapshot;
  onLoad(): void;
  onRemove(): void;
  onOpenNotices(): void;
  /** The identity shown in About; the build's own unless a test supplies another. */
  release?: ReleaseIdentity;
};

/** The About section: product, release and legal identity, nothing about the owner or the machine. */
function About({ release, onOpenNotices }: { release: ReleaseIdentity; onOpenNotices(): void }): JSX.Element {
  const t = useText();
  return (
    <section className="settings-about" aria-labelledby="settings-about-heading">
      <h2 id="settings-about-heading">{t('settings.about.heading')}</h2>
      <p>{t('settings.about.product', { product: release.product })}</p>
      <p>{t('settings.about.version', { version: release.version })}</p>
      <p>{t('settings.about.build', { build: release.build })}</p>
      <p>{t('settings.about.identification', { identification: release.identification })}</p>
      <p>{t('settings.about.author', { author: release.author })}</p>
      <p>{t('settings.about.copyright')}</p>
      <p>{t('settings.about.licence')}</p>
      <p>{t('settings.about.thirdParty')}</p>
      <div className="settings-actions">
        <Button appearance="secondary" data-action="open-notices" onClick={onOpenNotices}>
          {t('settings.about.notices')}
        </Button>
      </div>
    </section>
  );
}

export function SettingsView({ active, onLoad, onRemove, onOpenNotices, release = RELEASE }: SettingsViewProps): JSX.Element {
  const t = useText();
  const locale = useLocale();
  const [confirming, setConfirming] = useState(false);

  const fileName = active.kind === 'none' ? null : active.identity.fileName;

  return (
    <section className="settings">
      <h1>{t('rail.settings')}</h1>
      <h2>{t('settings.snapshot.heading')}</h2>
      {fileName !== null && <p className="settings-name">{fileName}</p>}
      {active.kind === 'loaded' && (
        <>
          <p>
            {t('settings.snapshot.taken', {
              datetime: formatDateTime(active.snapshot.meta.generatedAt, locale),
              relative: formatRelative(active.snapshot.meta.generatedAt, new Date(), locale),
            })}
          </p>
          <p className="figure">
            {t('settings.snapshot.holds', {
              accounts: active.snapshot.accounts.length,
              transactions: active.snapshot.transactions.length,
            })}
          </p>
        </>
      )}
      {active.kind === 'refused' && <p className="settings-refused">{t('settings.snapshot.refused')}</p>}
      {active.kind === 'none' && <p>{t('settings.snapshot.none')}</p>}
      <div className="settings-actions">
        {active.kind === 'none' ? (
          <Button appearance="primary" onClick={onLoad}>
            {t('snapshot.empty.action')}
          </Button>
        ) : (
          <>
            <Button appearance="primary" onClick={onLoad}>
              {t('status.loadAnother')}
            </Button>
            <Button appearance="secondary" onClick={() => setConfirming(true)}>
              {t('settings.snapshot.remove')}
            </Button>
          </>
        )}
      </div>
      {/*
        Removal confirms first, and the confirmation says the one thing that
        makes this different from an undoable action (r002 §11.6).
      */}
      <Dialog open={confirming} onOpenChange={(_event, data) => setConfirming(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t('settings.snapshot.remove')}</DialogTitle>
            <DialogContent>{t('settings.snapshot.remove.confirm')}</DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setConfirming(false)}>
                {t('dialog.cancel')}
              </Button>
              <Button
                appearance="primary"
                onClick={() => {
                  setConfirming(false);
                  onRemove();
                }}
              >
                {t('settings.snapshot.remove')}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
      <About release={release} onOpenNotices={onOpenNotices} />
    </section>
  );
}
