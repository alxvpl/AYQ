// What AYQ has read: one row per import, and what each one came to.
//
// Counts only. A statement's contents are the owner's and do not belong in a
// list of what happened; what belongs here is how many records arrived, how many
// were already held (03 §2.3 deduplicates on `imported_id`, and a ZIP of daily
// exports overlaps by construction), and what the import set in motion — rules
// that filed something, expected payments it turned out to be, and matches it
// left waiting.

import { makeStyles } from '@fluentui/react-components';
import { useEffect, useState, type ReactNode } from 'react';

import { ayqAsk } from '../ayq-bridge.ts';
import { ayqImportProblemText } from '../ayq-reasons.ts';
import type { AyqImportRecord } from '../ayq-ipc-contract.ts';
import { ayqCount, ayqList, ayqMoment, ayqText } from '../ayq-strings.ts';
import { AyqButton } from '../ayq-ui/ayq-button.tsx';
import { AyqTable, type AyqColumn } from '../ayq-ui/ayq-table.tsx';

const useStyles = makeStyles({
  quiet: { color: 'var(--ayq-ink-faint)' },
  note: { margin: '0', color: 'var(--ayq-ink-quiet)' },
  problems: {
    listStyleType: 'none',
    margin: '12px 0 0',
    padding: '0',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  problem: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' },
  heading: { margin: '12px 0 0', fontSize: 'var(--ayq-size-small)', fontWeight: 600 },
});

/** What an import set in motion, in words, and "nothing else" when it did not. */
function andThen(one: AyqImportRecord): string {
  const said: string[] = [];
  if (one.categorised > 0) {
    said.push(ayqText('import.outcome.categorised', { count: ayqCount(one.categorised) }));
  }
  if (one.matched > 0) {
    said.push(ayqText('import.outcome.matched', { count: ayqCount(one.matched) }));
  }
  if (one.matchesWaiting > 0) {
    said.push(ayqText('import.outcome.waiting', { count: ayqCount(one.matchesWaiting) }));
  }
  if (one.failed > 0) {
    said.push(ayqText('import.outcome.failed', { count: ayqCount(one.failed) }));
  }
  return said.length === 0 ? ayqText('import.outcome.nothing') : ayqList(said);
}

export function AyqImportHistory({
  round,
  onFailure,
  onChanged,
}: {
  /** Bumped by the screen above when an import has just finished. */
  round: number;
  onFailure(message: string): void;
  /** The owner marked a file as handled: what needs attention has changed. */
  onChanged?(): void;
}): ReactNode {
  const styles = useStyles();
  const [records, setRecords] = useState<readonly AyqImportRecord[] | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const answer = await ayqAsk({ kind: 'imports.list' });
      if (!answer.ok) throw new Error(answer.message);
      if (answer.kind !== 'imports.list') return;
      if (live) setRecords(answer.result);
    })().catch((error: unknown) => {
      if (live) onFailure(error instanceof Error ? error.message : String(error));
    });
    return () => {
      live = false;
    };
  }, [round, onFailure]);

  if (records === null) {
    return <p className={styles.note}>{ayqText('common.loading')}</p>;
  }

  const columns: readonly AyqColumn<AyqImportRecord>[] = [
    {
      id: 'at',
      header: ayqText('import.column.at'),
      cell: row => <span data-ayq-cell="at">{ayqMoment(row.at)}</span>,
    },
    {
      id: 'file',
      header: ayqText('import.column.file'),
      cell: row => (
        <span data-ayq-cell="file">
          {row.files > 1 ? ayqText('import.files', { count: ayqCount(row.files) }) : row.file}
        </span>
      ),
    },
    {
      id: 'account',
      header: ayqText('import.column.account'),
      cell: row => (
        <span data-ayq-cell="account" className={styles.quiet}>
          {row.accountName}
        </span>
      ),
    },
    {
      id: 'records',
      header: ayqText('import.column.records'),
      figures: true,
      cell: row => <span data-ayq-cell="records">{ayqCount(row.records)}</span>,
    },
    {
      id: 'imported',
      header: ayqText('import.column.imported'),
      figures: true,
      cell: row => <span data-ayq-cell="imported">{ayqCount(row.imported)}</span>,
    },
    {
      id: 'duplicates',
      header: ayqText('import.column.duplicates'),
      figures: true,
      cell: row => <span data-ayq-cell="duplicates">{ayqCount(row.duplicates)}</span>,
    },
    {
      id: 'outcome',
      header: ayqText('import.column.outcome'),
      cell: row => (
        <span data-ayq-cell="outcome" className={styles.quiet}>
          {andThen(row)}
        </span>
      ),
    },
  ];

  // Every file an import could not use, and whether the owner has dealt with
  // it (013 §1b). Marking one changes this history; Needs attention then no
  // longer finds the condition, which is why its row goes.
  const problems = records.flatMap(record =>
    (record.problems ?? []).map(problem => ({ record, problem })),
  );
  const handle = (importId: string, name: string): void => {
    void (async () => {
      const answer = await ayqAsk({ kind: 'imports.markHandled', importId, name });
      if (!answer.ok) {
        onFailure(answer.message);
        return;
      }
      if (answer.kind !== 'imports.markHandled') return;
      setRecords(answer.result);
      onChanged?.();
    })();
  };

  return (
    <>
      <AyqTable
        mark="imports"
        columns={columns}
        rows={records}
        keyOf={row => row.id}
        empty={ayqText('import.history.none')}
      />
      {problems.length === 0 ? null : (
        <>
          <h3 className={styles.heading}>{ayqText('import.problems.title')}</h3>
          <ul className={styles.problems} data-ayq-import-problems={String(problems.length)}>
            {problems.map(({ record, problem }) => (
              <li
                key={`${record.id}/${problem.name}`}
                className={styles.problem}
                data-ayq-import-problem={problem.name}
                data-ayq-handled={problem.handledAt === undefined ? 'no' : 'yes'}
              >
                <span>{ayqImportProblemText(problem)}</span>
                <span className={styles.quiet}>{ayqMoment(record.at)}</span>
                {problem.handledAt === undefined ? (
                  <AyqButton
                    mark={`import-handle-${problem.name}`}
                    onClick={() => handle(record.id, problem.name)}
                  >
                    {ayqText('import.problems.handle')}
                  </AyqButton>
                ) : (
                  <span className={styles.quiet}>
                    {ayqText('import.problems.handled', {
                      when: ayqMoment(problem.handledAt),
                    })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
