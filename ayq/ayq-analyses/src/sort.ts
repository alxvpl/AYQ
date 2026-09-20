// AYQ Analyses — A1 table ordering.
//
// Sorting reorders the rows of the one engine result and computes nothing. The
// comparator is deterministic and locale-independent: the Windows locale may
// change how a figure is printed, never which row comes first (006, 007 §16).

import { compareKeys } from './engine.js';
import type { CounterpartyRow } from './types.js';

export type SortColumn = 'counterparty' | 'transactions' | 'moneyOut' | 'previous' | 'change';
export type SortDirection = 'ascending' | 'descending';

export interface SortState {
  column: SortColumn;
  direction: SortDirection;
}

export const DEFAULT_SORT: SortState = { column: 'moneyOut', direction: 'descending' };

/**
 * Clicking a header cycles descending → ascending → back to the default order,
 * so the default is always one step away.
 */
export function nextSortState(current: SortState, column: SortColumn): SortState {
  if (current.column !== column) return { column, direction: 'descending' };
  if (current.direction === 'descending') return { column, direction: 'ascending' };
  return DEFAULT_SORT;
}

function value(row: CounterpartyRow, column: SortColumn): number | null {
  switch (column) {
    case 'transactions':
      return row.transactionCount;
    case 'moneyOut':
      return row.moneyOutMinor;
    case 'previous':
      return row.previousMinor;
    case 'change':
      return row.changeMinor;
    case 'counterparty':
      return null;
  }
}

/** Ties break by counterparty name, then by counterparty key. */
function tieBreak(a: CounterpartyRow, b: CounterpartyRow): number {
  return compareKeys(a.displayName, b.displayName) || compareKeys(a.counterpartyKey, b.counterpartyKey);
}

export function sortRows(rows: readonly CounterpartyRow[], sort: SortState): CounterpartyRow[] {
  const factor = sort.direction === 'ascending' ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (sort.column === 'counterparty') {
      const byName = compareKeys(a.displayName, b.displayName) || compareKeys(a.counterpartyKey, b.counterpartyKey);
      return byName * factor;
    }
    const left = value(a, sort.column);
    const right = value(b, sort.column);
    if (left === null || right === null) return tieBreak(a, b);
    if (left !== right) return (left - right) * factor;
    return tieBreak(a, b);
  });
}
