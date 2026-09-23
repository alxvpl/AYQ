// The look of a field, as template r003 draws one: the field surface, the
// control edge, the small radius. Applied to Fluent's Input and Select by class
// name — their height stays Fluent's own (A39 is explicit that compact 28 is
// for AYQ-owned wrappers and not a licence to resize Fluent fields).

import { makeStyles } from '@fluentui/react-components';

import { AYQ_METRIC, AYQ_TYPE } from '../ayq-tokens.ts';
import { ayqBorder } from './ayq-css.ts';

export const useAyqFieldStyles = makeStyles({
  field: {
    backgroundColor: 'var(--ayq-field)',
    borderRadius: `${AYQ_METRIC.radiusSmall}px`,
    fontSize: AYQ_TYPE.size.body,
    minWidth: '130px',
    ...ayqBorder('var(--ayq-control-edge)'),
    ':hover': ayqBorder('var(--ayq-control-edge)'),
    // Fluent draws its focus as a thick bottom line; AYQ's is the ring (A16).
    '::after': { display: 'none' },
    ':focus-within': {
      outlineWidth: `${AYQ_METRIC.focusRing}px`,
      outlineStyle: 'solid',
      outlineColor: 'var(--ayq-accent-focus)',
      outlineOffset: '1px',
    },
    '& > select': { backgroundColor: 'transparent' },
    '& > input': { backgroundColor: 'transparent' },
  },
  /** A label standing before a field in a bar. */
  label: {
    fontSize: AYQ_TYPE.size.small,
    color: 'var(--ayq-label)',
    marginLeft: '3px',
    whiteSpace: 'nowrap',
  },
  /** A field bar: the pane surface on 6 of padding with 6 between (A39). */
  bar: {
    minHeight: '40px',
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: `${AYQ_METRIC.space.small}px`,
    padding: `${AYQ_METRIC.space.small}px`,
    backgroundColor: 'var(--ayq-pane)',
    ...ayqBorder('var(--ayq-line)'),
    borderRadius: `${AYQ_METRIC.radiusMedium}px`,
  },
});
