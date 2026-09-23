// Settings → About: which build of AYQ this is.
//
// A tab, not a rail destination, and no version number anywhere else in the
// product (12 §12.3). A person looks for this once — when something has gone
// wrong and somebody has asked which build they are running — and looking for
// it in Settings is where people look.
//
// Every figure comes from the engine, which composed it from git, the clock at
// build time, the manifest and the API that actually loaded (§12.2). Every
// sentence comes from the catalogue (04 A24). On screen the build date is read
// the way a person reads a date and the revision is shortened (04 A35, 06
// §3.6); the exact ISO timestamp and the full SHA are in the copied text only.
//
// **Copy technical information** copies exactly the string the engine built and
// nothing else, and that string is not also printed on the screen (06 §3.7).
// It is deliberately not assembled here: the privacy contract in §12.4 is one
// function with one test over it, and a renderer that composed its own text
// could put a budget name or a path into it without the test noticing.

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { makeStyles } from '@fluentui/react-components';

import { AyqMark } from '../ayq-brand/ayq-mark.tsx';
import { ayqAsk } from '../ayq-bridge.ts';
import type { AyqAbout } from '../ayq-ipc-contract.ts';
import { ayqDate, ayqText } from '../ayq-strings.ts';
import { AYQ_METRIC, AYQ_TYPE } from '../ayq-tokens.ts';
import { AyqButton } from '../ayq-ui/ayq-button.tsx';
import { AyqPane } from '../ayq-ui/ayq-pane.tsx';

const useStyles = makeStyles({
  grid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
    gap: `${AYQ_METRIC.splitGap}px`,
    alignItems: 'start',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: `${AYQ_METRIC.space.wide}px`,
    padding: `${AYQ_METRIC.panePadding}px`,
  },
  name: {
    margin: '0',
    fontFamily: 'var(--ayq-font-display)',
    fontSize: 'var(--ayq-size-heading)',
  },
  tagline: { margin: '0', color: 'var(--ayq-ink-quiet)' },
  identity: {
    display: 'flex',
    gap: `${AYQ_METRIC.space.wide}px`,
    alignItems: 'center',
  },
  facts: {
    display: 'grid',
    gridTemplateColumns: '170px minmax(0, 1fr)',
    rowGap: '3px',
    columnGap: `${AYQ_METRIC.space.medium}px`,
    margin: '0',
  },
  label: { color: 'var(--ayq-ink-faint)', fontSize: 'var(--ayq-size-small)' },
  value: {
    margin: '0',
    fontVariantNumeric: AYQ_TYPE.figures,
    overflowWrap: 'anywhere',
  },
  note: {
    margin: '0',
    color: 'var(--ayq-ink-quiet)',
    fontSize: 'var(--ayq-size-small)',
  },
  copyright: { margin: '0', color: 'var(--ayq-ink-quiet)' },
  said: { color: 'var(--ayq-ink-quiet)', fontSize: 'var(--ayq-size-small)' },
});

/** How many characters of the revision the screen shows; the copy has all 40. */
const REVISION_SHOWN = 9;

/** How long "Copied." stays on the screen. */
const COPIED_FOR_MS = 2500;

function Fact({
  label,
  value,
  mark,
}: {
  label: string;
  value: string;
  mark: string;
}): ReactNode {
  const styles = useStyles();
  return (
    <>
      <dt className={styles.label}>{label}</dt>
      <dd className={styles.value} data-ayq-about={mark}>
        {value}
      </dd>
    </>
  );
}

export function AyqAboutScreen({
  onFailure,
}: {
  onFailure(message: string): void;
}): ReactNode {
  const styles = useStyles();
  const [about, setAbout] = useState<AyqAbout | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const answered = await ayqAsk({ kind: 'about' });
      if (!answered.ok) throw new Error(answered.message);
      if (live) setAbout(answered.result as AyqAbout);
    })().catch((error: unknown) => {
      if (live) {
        onFailure(error instanceof Error ? error.message : String(error));
      }
    });
    return () => {
      live = false;
    };
  }, [onFailure]);

  // "Copied." is a brief confirmation (04 A35), not a state the screen keeps.
  useEffect(() => {
    if (!copied) return;
    const done = setTimeout(() => setCopied(false), COPIED_FOR_MS);
    return () => clearTimeout(done);
  }, [copied]);

  if (about === null) {
    return <p className={styles.note}>{ayqText('common.loading')}</p>;
  }

  return (
    <div className={styles.grid} data-ayq-about-screen="">
      <AyqPane mark="about" title={ayqText('about.pane')}>
        <div className={styles.body}>
          <div className={styles.identity}>
            {/* The mark, from the same master the icon is built from (06 §3.6). */}
            <AyqMark size={48} />
            <div>
              <h2 className={styles.name}>{about.productName}</h2>
              <p className={styles.tagline}>{about.tagline}</p>
            </div>
          </div>

          <dl className={styles.facts}>
            <Fact
              label={ayqText('about.author')}
              value={about.author}
              mark="author"
            />
            <Fact
              label={ayqText('about.version')}
              value={about.productVersion}
              mark="version"
            />
            <Fact
              label={ayqText('about.build')}
              value={about.buildNumber}
              mark="build"
            />
            <Fact
              label={ayqText('about.buildDate')}
              value={
                Number.isNaN(Date.parse(about.buildDate))
                  ? ayqText('about.buildDate.none')
                  : ayqDate(about.buildDate)
              }
              mark="build-date"
            />
            <Fact
              label={ayqText('about.architecture')}
              value={about.architecture}
              mark="architecture"
            />
            <Fact
              label={ayqText('about.revision')}
              value={
                about.revision === null
                  ? ayqText('about.revision.none')
                  : about.revision.slice(0, REVISION_SHOWN)
              }
              mark="revision"
            />
            <Fact
              label={ayqText('about.engine')}
              value={about.engine}
              mark="engine"
            />
            <Fact
              label={ayqText('about.baseline')}
              value={about.actualBaseline}
              mark="baseline"
            />
          </dl>

          {about.development ? (
            <p className={styles.note} data-ayq-about="development">
              {ayqText('about.development')}
            </p>
          ) : null}

          <p className={styles.note} data-ayq-about="local-first">
            {ayqText('about.localFirst')}
          </p>
          {/* Two different things, and About keeps them apart (01 §6, 06 §9):
            AYQ's own code is proprietary; Actual Budget is used under MIT. */}
          <p className={styles.note} data-ayq-about="licence">
            {ayqText('about.licence.ayq')}
          </p>
          <p className={styles.note} data-ayq-about="upstream">
            {ayqText('about.licence.actual')}
          </p>

          {/* Only links the manifest really declares. None are written here, so
            none can be invented here. */}
          {about.links.length === 0 ? null : (
            <p className={styles.note} data-ayq-about="links">
              {about.links.map(link => (
                <a key={link.url} href={link.url}>
                  {ayqText('about.link.repository')}
                </a>
              ))}
            </p>
          )}

          <p className={styles.copyright} data-ayq-about="copyright">
            {about.copyright}
          </p>
        </div>
      </AyqPane>

      <AyqPane mark="about-technical" title={ayqText('about.technical')}>
        <div className={styles.body}>
          <p className={styles.note}>{ayqText('about.technical.note')}</p>
          <p className={styles.note}>
            <AyqButton
              mark="about-copy"
              onClick={() => {
                // Exactly what the engine composed, and nothing added on the way.
                void navigator.clipboard
                  ?.writeText(about.technicalInformation)
                  .then(() => setCopied(true))
                  .catch(() => setCopied(false));
              }}
            >
              {ayqText('about.copy')}
            </AyqButton>{' '}
            <output className={styles.said} data-ayq-about-copied="">
              {copied ? ayqText('about.copied') : null}
            </output>
          </p>
        </div>
      </AyqPane>
    </div>
  );
}
