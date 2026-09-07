// Критериите за PASS на CAMT спайка, проверени машинно.
//
// Числата по подразбиране идват от AYQ_camt_measurement-r001.md — измерването
// върху 212 дневни файла от една частна сметка. Подават се отвън, за да може
// същата проверка да се пусне срещу друг експорт.
//
// Оценката е отделена от печатането, за да е тествана без файлове на диска.

import type { AyqCoverageReport } from './ayq-coverage.ts';
import type { AyqMeasurement } from './ayq-measure.ts';

export type AyqExpectations = {
  files: number;
  entries: number;
  withTxDtls: number;
  withoutTxDtls: number;
};

/** Измереното в r001. */
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
  /** Информативна проверка — не проваля спайка, а иска решение. */
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
 * Оценява резултата срещу критериите.
 *
 * Непокритите XML пътища са нарочно **advisory**: те не са провал, а списъкът
 * с решения — кое поле влиза в AyqBankEntry и кое остава извън него.
 */
export function ayqEvaluateSpike(
  measurement: AyqMeasurement,
  coverage: AyqCoverageReport,
  failedFiles: number,
  expectations: AyqExpectations = AYQ_R001_EXPECTATIONS,
): AyqSpikeVerdict {
  const uncovered = Object.keys(coverage.uncovered);

  const checks: AyqCheck[] = [
    check('файлове, прочетени без грешка', expectations.files, measurement.files - failedFiles),
    check('файлове с грешка при парсване', 0, failedFiles),
    check('записи <Ntry>', expectations.entries, measurement.entries),
    check('записи с <TxDtls>', expectations.withTxDtls, measurement.withTxDtls),
    check('записи без <TxDtls>', expectations.withoutTxDtls, measurement.withoutTxDtls),
    check(
      'BkTxCd при всеки междинен запис',
      measurement.records,
      measurement.present.bankTransactionCode,
    ),
    check(
      'BookgDt и ValDt при всеки междинен запис',
      measurement.records,
      measurement.present.bothDates,
    ),
    check('непрочетени XML пътища', 0, uncovered.length, true),
  ];

  return {
    // Advisory проверките не влияят на присъдата.
    passed: checks.every(item => item.advisory === true || item.passed),
    checks,
  };
}
