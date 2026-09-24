// AYQ Analyses — snapshot validation.
//
// Validation completes before analytical execution. A snapshot that fails it
// produces no analytical result and no partial screen: only a bounded typed
// reason crosses the preload boundary, and the diagnostic detail is logged,
// never rendered (007 §6, r03 §4).
//
// The rules are the executable contract's own (ayq/ayq-analytical-contract):
// the same validator the producer runs before it writes a byte. This module
// adds nothing to them; it only folds the contract's issue codes into the four
// reasons the catalogue has a sentence for.

import {
  ContractValidationError,
  validateAnalyticalSnapshot,
  type ContractIssue,
} from '../../ayq-analytical-contract/src/index.ts';
import type { AyqAnalyticalSnapshot } from './types.js';

/** The catalogue chooses its sentence from this code. It is never shown. */
export type SnapshotInvalidReason = 'contractMajor' | 'malformed' | 'invariant' | 'unknown';

export class SnapshotValidationError extends Error {
  readonly reason: SnapshotInvalidReason;
  readonly issues: readonly ContractIssue[];

  constructor(reason: SnapshotInvalidReason, message: string, issues: readonly ContractIssue[] = []) {
    super(message);
    this.name = 'SnapshotValidationError';
    this.reason = reason;
    this.issues = issues;
  }
}

/**
 * Shape violations: the file is not a snapshot, or parts of it are missing or
 * of the wrong kind. Everything else the contract refuses is a violation of a
 * relationship between values the file does state — an inconsistency.
 */
const SHAPE_CODES = new Set([
  'not_object',
  'not_array',
  'not_string',
  'empty_string',
  'not_boolean',
  'not_date',
  'not_month',
  'not_integer',
  'not_positive_integer',
  'not_safe_integer',
  'not_currency',
  'not_version',
  'not_rfc3339_utc',
  'not_allowed',
  'unexpected',
  'too_long',
  'line_break',
  'not_masked',
  // Contract 1.1: a fact the declared minor requires is absent.
  'missing',
]);

/**
 * Data the contract forbids from crossing at all (03 §13.8). The file is
 * then not a snapshot this application can read, whatever else it holds.
 */
const EXCLUDED_DATA_CODES = new Set(['forbidden_key', 'iban_leak']);

/**
 * The reason is read from the first issue the contract found. A shape fault
 * makes the validator drop the record it was in, and the integrity counts
 * then disagree with what is left: that second issue is a consequence, not
 * the reason, so it never turns a malformed file into an inconsistent one.
 */
export function reasonOf(issues: readonly ContractIssue[]): SnapshotInvalidReason {
  if (issues.length === 0) return 'unknown';
  if (issues.some(issue => issue.code === 'major_too_new')) return 'contractMajor';
  if (issues.some(issue => issue.code === 'major_too_old')) return 'unknown';
  if (issues.some(issue => EXCLUDED_DATA_CODES.has(issue.code))) return 'unknown';
  return SHAPE_CODES.has(issues[0].code) ? 'malformed' : 'invariant';
}

export function validateSnapshot(raw: unknown): AyqAnalyticalSnapshot {
  try {
    return validateAnalyticalSnapshot(raw);
  } catch (error) {
    if (error instanceof ContractValidationError) {
      const detail = error.issues.map(issue => `${issue.code} at ${issue.path}: ${issue.message}`).join('; ');
      throw new SnapshotValidationError(reasonOf(error.issues), detail, error.issues);
    }
    throw error;
  }
}

/** Parses and validates, returning the bounded reason rather than raw detail. */
export function parseAndValidateSnapshot(
  text: string,
): { ok: true; snapshot: AyqAnalyticalSnapshot } | { ok: false; reason: SnapshotInvalidReason; detail: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { ok: false, reason: 'malformed', detail: error instanceof Error ? error.message : String(error) };
  }
  try {
    return { ok: true, snapshot: validateSnapshot(parsed) };
  } catch (error) {
    if (error instanceof SnapshotValidationError) {
      return { ok: false, reason: error.reason, detail: error.message };
    }
    return { ok: false, reason: 'unknown', detail: error instanceof Error ? error.message : String(error) };
  }
}
