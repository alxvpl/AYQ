// What went wrong, said above everything else.
//
// An engine that cannot answer is not a blank screen: the message is the
// engine's own words, and the one thing that reliably helps — trying again — is
// beside it. It stays until it is dismissed.
//
// It keeps the id the acceptance runs read it by: a packaged application has no
// console, so this element is where a refusal can be found at all.

import { makeStyles } from '@fluentui/react-components';
import type { ReactNode } from 'react';

import { ayqText } from '../ayq-strings.ts';
import { AYQ_METRIC } from '../ayq-tokens.ts';
import { AyqButton } from './ayq-button.tsx';

const useStyles = makeStyles({
  notice: {
    display: 'flex',
    alignItems: 'center',
    gap: `${AYQ_METRIC.space.wide}px`,
    flexWrap: 'wrap',
    margin: `${AYQ_METRIC.space.wide}px ${AYQ_METRIC.space.edge}px 0`,
    padding: `9px ${AYQ_METRIC.space.wide}px`,
    borderRadius: 'var(--ayq-radius-small)',
    backgroundColor: 'var(--ayq-state-overdue-bg)',
    color: 'var(--ayq-state-overdue-fg)',
    fontSize: 'var(--ayq-size-small)',
  },
  words: { flexGrow: 1, flexBasis: '320px', whiteSpace: 'pre-wrap' },
});

export function AyqNotice({
  message,
  retry,
  dismiss,
}: {
  message: string | null;
  retry(): void;
  dismiss(): void;
}): ReactNode {
  const styles = useStyles();
  if (message === null || message === '') {
    // Present but empty, because the acceptance run looks this element up by id
    // and reads whether it is hidden.
    return <div id="ayq-problem" hidden />;
  }
  return (
    <div id="ayq-problem" className={styles.notice} role="alert">
      <span className={styles.words}>{message}</span>
      <AyqButton size="small" mark="retry" onClick={retry}>
        {ayqText('notice.retry')}
      </AyqButton>
      <AyqButton size="small" mark="dismiss" onClick={dismiss}>
        {ayqText('notice.dismiss')}
      </AyqButton>
    </div>
  );
}
