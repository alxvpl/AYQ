// Appearance: the ground, and what the tokens actually look like.
//
// The first screen AYQ draws of its own, in Fluent UI React v9 (04 A15). It
// exists because A23 gives the owner a choice and a choice needs somewhere to
// be made — and because the token module's claims are easier to judge on a
// screen than in a file.
//
// Nothing here is decorative. Every swatch is the token itself: if the accent
// changes in `ayq-tokens.ts`, this screen changes with it.

import {
  Radio,
  RadioGroup,
  Text,
  makeStyles,
} from '@fluentui/react-components';
import type { ReactNode } from 'react';

import { AyqButton } from '../ayq-ui/ayq-button.tsx';
import { AyqFigure } from '../ayq-ui/ayq-figure.tsx';
import { AyqStateChip } from '../ayq-ui/ayq-state-chip.tsx';
import { useAyqGround } from '../ayq-ui/ayq-ground-provider.tsx';
import { AyqPane } from '../ayq-ui/ayq-pane.tsx';
import { AyqSettingBody, AyqSettingRow } from './ayq-settings.tsx';
import { ayqText, type AyqStringKey } from '../ayq-strings.ts';
import {
  AYQ_ACCENT,
  AYQ_GROUNDS,
  AYQ_METRIC,
  AYQ_STATES,
  AYQ_TYPE,
  type AyqGround,
  type AyqStateName,
} from '../ayq-tokens.ts';

const useStyles = makeStyles({
  screen: {
    display: 'flex',
    flexDirection: 'column',
    gap: `${AYQ_METRIC.space.wide}px`,
    padding: `${AYQ_METRIC.space.screen}px 0`,
    color: 'var(--ayq-ink)',
  },
  blurb: { color: 'var(--ayq-ink-quiet)', maxWidth: '74ch' },
  pane: {
    backgroundColor: 'var(--ayq-pane)',
    border: 'var(--ayq-hairline) solid var(--ayq-line)',
    borderRadius: 'var(--ayq-radius-medium)',
    padding: `${AYQ_METRIC.space.wide}px ${AYQ_METRIC.space.screen}px`,
    display: 'flex',
    flexDirection: 'column',
    gap: `${AYQ_METRIC.space.medium}px`,
    maxWidth: '760px',
  },
  heading: {
    fontFamily: 'var(--ayq-font-display)',
    fontSize: 'var(--ayq-size-heading)',
    fontWeight: AYQ_TYPE.weight.semibold,
  },
  note: { color: 'var(--ayq-ink-faint)', fontSize: 'var(--ayq-size-small)' },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: `${AYQ_METRIC.space.wide}px`,
    flexWrap: 'wrap',
  },
  swatch: {
    width: '44px',
    height: '24px',
    borderRadius: 'var(--ayq-radius-small)',
    backgroundColor: 'var(--ayq-accent)',
    color: 'var(--ayq-accent-ink)',
    display: 'grid',
    placeItems: 'center',
    fontSize: '10px',
    fontWeight: AYQ_TYPE.weight.semibold,
  },
  failure: { color: 'var(--ayq-state-overdue-fg)' },
});

const STATE_LABEL: Record<AyqStateName, AyqStringKey> = {
  confirmed: 'state.confirmed',
  rule: 'state.rule',
  suggested: 'state.suggested',
  overdue: 'state.overdue',
  neutral: 'state.neutral',
  uncategorised: 'state.uncategorised',
  operational: 'state.operational',
};

const GROUND_LABEL: Record<AyqGround, AyqStringKey> = {
  light: 'ground.light',
  dark: 'ground.dark',
  system: 'ground.system',
};

export function AyqAppearanceScreen(): ReactNode {
  const styles = useStyles();
  const { ground, resolved, failure, saving, choose } = useAyqGround();

  return (
    <div data-ayq-screen="appearance">
      <AyqPane mark="appearance">
        <AyqSettingBody>
          {/* The ground (A23): a choice, and what System resolved to. */}
          <AyqSettingRow
            mark="ground"
            name={ayqText('appearance.ground.heading')}
            note={
              <>
                {ground === 'system'
                  ? ayqText('appearance.ground.following', {
                      ground: ayqText(
                        resolved === 'dark' ? 'ground.dark' : 'ground.light',
                      ),
                    })
                  : ayqText('appearance.ground.hint')}
                {saving ? <> {ayqText('appearance.saving')}</> : null}
                {failure === null ? null : (
                  <span className={styles.failure} data-ayq-ground-failure="yes">
                    {' '}
                    {ayqText('appearance.failed', { reason: failure })}
                  </span>
                )}
              </>
            }
          >
            <RadioGroup
              layout="horizontal"
              value={ground}
              data-ayq-ground-choice={ground}
              onChange={(_event, data) => choose(data.value as AyqGround)}
            >
              {AYQ_GROUNDS.map(one => (
                <Radio
                  key={one}
                  value={one}
                  label={ayqText(GROUND_LABEL[one])}
                  data-ayq-ground-option={one}
                />
              ))}
            </RadioGroup>
          </AyqSettingRow>

          <AyqSettingRow
            mark="buttons"
            name={ayqText('appearance.buttons.heading')}
            note={ayqText('appearance.buttons.note')}
          >
            <AyqButton filled>{ayqText('appearance.buttons.primary')}</AyqButton>
            <AyqButton>{ayqText('appearance.buttons.secondary')}</AyqButton>
            <AyqButton disabled>{ayqText('appearance.buttons.disabled')}</AyqButton>
          </AyqSettingRow>

          <AyqSettingRow
            mark="accent"
            name={ayqText('appearance.accent.heading')}
            note={ayqText('appearance.accent.note')}
          >
            <span className={styles.swatch} data-ayq-accent={AYQ_ACCENT}>
              {AYQ_ACCENT}
            </span>
          </AyqSettingRow>

          <AyqSettingRow mark="states" name={ayqText('appearance.states.heading')}>
            {AYQ_STATES.map(state => (
              <AyqStateChip
                key={state}
                state={state}
                label={ayqText(STATE_LABEL[state])}
              />
            ))}
          </AyqSettingRow>

          <AyqSettingRow
            mark="figures"
            name={ayqText('appearance.figures.heading')}
            note={
              <>
                {ayqText('appearance.figures.note')} {ayqText('sample.figure.note')}
              </>
            }
          >
            <AyqFigure cents={197845} size="headline" />
            <AyqFigure cents={-17974} size="large" />
            <AyqFigure cents={306026} withSymbol />
          </AyqSettingRow>
        </AyqSettingBody>
      </AyqPane>
    </div>
  );
}
