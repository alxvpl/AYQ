// The PASS criteria for the CAMT spike, checked mechanically.
//
// The default numbers come from AYQ_camt_measurement-r001.md — the measurement
// over 212 daily files from one private account. They are passed in, so the
// same check can run against a different export.
//
// Evaluation is separated from printing, so it can be tested without files on
// disk.

import type { AyqCoverageReport } from './ayq-coverage.ts';
import type { AyqMeasurement } from './ayq-measure.ts';

export type AyqExpectations = {
  files: number;
  entries: number;
  withTxDtls: number;
  withoutTxDtls: number;
};

/** What r001 measured. */
export const AYQ_R001_EXPECTATIONS: AyqExpectations = {
  files: 212,
  entries: 567,
  withTxDtls: 350,
  withoutTxDtls: 217,
};

export type AyqCheck = {
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
  /** Informational: does not fail the spike, but calls for a decision. */
  advisory?: boolean;
};

export type AyqSpikeVerdict = {
  passed: boolean;
  checks: AyqCheck[];
};

function check(
  name: string,
  expected: number | string,
  actual: number | string,
  advisory = false,
): AyqCheck {
  return {
    name,
    passed: String(expected) === String(actual),
    expected: String(expected),
    actual: String(actual),
    advisory,
  };
}

/**
 * Evaluates the result against the criteria.
 *
 * Uncovered XML paths are deliberately **advisory**: they are not a failure
 * but the list of decisions — which field enters AyqBankEntry and which stays
 * out of it.
 */
export function ayqEvaluateSpike(
  measurement: AyqMeasurement,
  coverage: AyqCoverageReport,
  failedFiles: number,
  expectations: AyqExpectations = AYQ_R001_EXPECTATIONS,
): AyqSpikeVerdict {
  const uncovered = Object.keys(coverage.uncovered);

  const checks: AyqCheck[] = [
    check(
      'files read without error',
      expectations.files,
      measurement.files - failedFiles,
    ),
    check('files that failed to parse', 0, failedFiles),
    check('<Ntry> entries', expectations.entries, measurement.entries),
    check('entries with <TxDtls>', expectations.withTxDtls, measurement.withTxDtls),
    check(
      'entries without <TxDtls>',
      expectations.withoutTxDtls,
      measurement.withoutTxDtls,
    ),
    check(
      'BkTxCd on every intermediate record',
      measurement.records,
      measurement.present.bankTransactionCode,
    ),
    check(
      'BookgDt and ValDt on every intermediate record',
      measurement.records,
      measurement.present.bothDates,
    ),
    check('uncovered XML paths', 0, uncovered.length, true),
    // r001 measured zero batched entries. Should one appear, this is exactly
    // the case r003 §11.4 worried about — and it shows rather than merging
    // silently.
    check('<Ntry> with more than one <TxDtls>', 0, measurement.batched, true),
  ];

  return {
    // Advisory checks do not affect the verdict.
    passed: checks.every(item => item.advisory === true || item.passed),
    checks,
  };
}
