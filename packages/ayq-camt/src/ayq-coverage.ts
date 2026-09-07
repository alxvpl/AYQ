// Доказателство за беззагубността.
//
// „Нищо не се губи“ е твърдение, а не свойство — затова тук то е проверимо.
// Одитът обхожда суровия XML под всеки <Ntry>, събира всички листни пътища и
// ги сравнява с декларирания списък на прочетеното. Каквото остане непокрито,
// излиза с брой попадения. Празен резултат означава, че записът наистина носи
// всичко, което банката е дала.
//
// Списъкът се поддържа на ръка нарочно: когато банката добави поле, одитът го
// съобщава, вместо парсърът тихо да го подмине.

import { ayqChildren, ayqParseXml, ayqFindAll, type AyqXmlNode } from './ayq-xml.ts';

/** Пътищата на една страна и сметката ѝ, относно RltdPties. */
function partyPaths(party: string, account: string | null): string[] {
  const paths = [
    `RltdPties/${party}/Nm`,
    `RltdPties/${party}/PstlAdr/Ctry`,
    `RltdPties/${party}/PstlAdr/AdrLine`,
    `RltdPties/${party}/Id/OrgId/Othr/Id`,
    `RltdPties/${party}/Id/PrvtId/Othr/Id`,
  ];
  if (account !== null) {
    paths.push(
      `RltdPties/${account}/Id/IBAN`,
      `RltdPties/${account}/Id/Othr/Id`,
      `RltdPties/${account}/Id/Othr/SchmeNm/Cd`,
      `RltdPties/${account}/Id/Othr/SchmeNm/Prtry`,
      `RltdPties/${account}/Ccy`,
    );
  }
  return paths;
}

/** Пътищата на BkTxCd, под даден префикс. */
function bankCodePaths(prefix: string): string[] {
  return [
    `${prefix}/Domn/Cd`,
    `${prefix}/Domn/Fmly/Cd`,
    `${prefix}/Domn/Fmly/SubFmlyCd`,
    `${prefix}/Prtry/Cd`,
    `${prefix}/Prtry/Issr`,
  ];
}

/** Пътищата на AmtDtls, под даден префикс. */
function amountDetailPaths(prefix: string): string[] {
  const paths: string[] = [];
  for (const slot of ['InstdAmt', 'TxAmt', 'CntrValAmt', 'PrtryAmt']) {
    paths.push(`${prefix}/${slot}/Amt`);
    for (const field of [
      'SrcCcy',
      'TrgtCcy',
      'UnitCcy',
      'XchgRate',
      'CtrctId',
      'QtnDt',
    ]) {
      paths.push(`${prefix}/${slot}/CcyXchg/${field}`);
    }
  }
  return paths;
}

/** Пътищата на Chrgs, под даден префикс — и с, и без вложен <Rcrd>. */
function chargePaths(prefix: string): string[] {
  const fields = ['Amt', 'CdtDbtInd', 'Br', 'Pty/FinInstnId/BIC'];
  return [
    ...fields.map(field => `${prefix}/${field}`),
    ...fields.map(field => `${prefix}/Rcrd/${field}`),
  ];
}

/** Пътищата на RtrInf, под даден префикс. */
function returnPaths(prefix: string): string[] {
  return [
    `${prefix}/Rsn/Cd`,
    `${prefix}/Rsn/Prtry`,
    `${prefix}/Orgtr/Nm`,
    `${prefix}/AddtlInf`,
    ...bankCodePaths(`${prefix}/OrgnlBkTxCd`),
  ];
}

/** Всичко, което междинният запис чете под един <Ntry>. */
export const AYQ_CAPTURED_ENTRY_PATHS: string[] = [
  'Amt',
  'CdtDbtInd',
  'RvslInd',
  'Sts',
  'BookgDt/Dt',
  'BookgDt/DtTm',
  'ValDt/Dt',
  'ValDt/DtTm',
  'AcctSvcrRef',
  'NtryRef',
  'AddtlNtryInf',
  ...bankCodePaths('BkTxCd'),
  ...amountDetailPaths('AmtDtls'),
  ...chargePaths('Chrgs'),
  ...returnPaths('RtrInf'),
  'NtryDtls/Btch/MsgId',
  'NtryDtls/Btch/PmtInfId',
  'NtryDtls/Btch/NbOfTxs',
  'NtryDtls/Btch/TtlAmt',
  'NtryDtls/Btch/CdtDbtInd',
  ...[
    'Refs/MsgId',
    'Refs/AcctSvcrRef',
    'Refs/PmtInfId',
    'Refs/InstrId',
    'Refs/EndToEndId',
    'Refs/TxId',
    'Refs/MndtId',
    'Refs/ChqNb',
    'Refs/ClrSysRef',
    'Refs/Prtry/Tp',
    'Refs/Prtry/Ref',
    'Amt',
    'CdtDbtInd',
    'Purp/Cd',
    'Purp/Prtry',
    'AddtlTxInf',
    'RmtInf/Ustrd',
    'RmtInf/Strd/CdtrRefInf/Ref',
    'RmtInf/Strd/CdtrRefInf/Tp/CdOrPrtry/Cd',
    'RmtInf/Strd/CdtrRefInf/Tp/CdOrPrtry/Prtry',
    'RmtInf/Strd/CdtrRefInf/Tp/Issr',
    'RmtInf/Strd/AddtlRmtInf',
    'RltdAgts/DbtrAgt/FinInstnId/BIC',
    'RltdAgts/CdtrAgt/FinInstnId/BIC',
    'RltdAgts/IntrmyAgt1/FinInstnId/BIC',
    ...bankCodePaths('BkTxCd'),
    ...amountDetailPaths('AmtDtls'),
    ...chargePaths('Chrgs'),
    ...returnPaths('RtrInf'),
    ...partyPaths('Dbtr', 'DbtrAcct'),
    ...partyPaths('Cdtr', 'CdtrAcct'),
    ...partyPaths('UltmtDbtr', null),
    ...partyPaths('UltmtCdtr', null),
  ].map(path => `NtryDtls/TxDtls/${path}`),
];

/** Всичко, което междинният запис чете извън <Ntry>. */
export const AYQ_CAPTURED_STATEMENT_PATHS: string[] = [
  'Id',
  'ElctrncSeqNb',
  'LglSeqNb',
  'CreDtTm',
  'FrToDt/FrDtTm',
  'FrToDt/ToDtTm',
  'FrToDt/FrDt',
  'FrToDt/ToDt',
  'Acct/Id/IBAN',
  'Acct/Id/Othr/Id',
  'Acct/Ccy',
  'Acct/Ownr/Nm',
  'Acct/Svcr/FinInstnId/BIC',
];

export type AyqCoverageReport = {
  /** Брой обходени <Ntry>. */
  entries: number;
  /** Пътища, които парсърът чете, с брой попадения. */
  covered: Record<string, number>;
  /** Пътища, които съществуват в XML-а, но записът не чете. */
  uncovered: Record<string, number>;
  /** Декларирани пътища без нито едно попадение в тези данни. */
  unusedDeclarations: string[];
};

function collectLeafPaths(
  node: AyqXmlNode,
  prefix: string,
  out: Map<string, number>,
): void {
  if (Array.isArray(node)) {
    for (const item of node) collectLeafPaths(item, prefix, out);
    return;
  }
  if (typeof node !== 'object' || node === null) {
    if (prefix.length > 0) out.set(prefix, (out.get(prefix) ?? 0) + 1);
    return;
  }

  const record = node as Record<string, unknown>;
  const childKeys = Object.keys(record).filter(key => key !== '$' && key !== '_');
  if (childKeys.length === 0) {
    // Елемент само с атрибути и/или текст — това е лист.
    if (prefix.length > 0) out.set(prefix, (out.get(prefix) ?? 0) + 1);
    return;
  }
  for (const key of childKeys) {
    collectLeafPaths(
      record[key],
      prefix.length > 0 ? `${prefix}/${key}` : key,
      out,
    );
  }
}

/**
 * Сравнява какво съдържа XML-ът с това, което междинният запис чете.
 *
 * Приема суровото съдържание на един или няколко CAMT файла.
 */
export async function ayqAuditCoverage(
  contents: string[],
): Promise<AyqCoverageReport> {
  const captured = new Set([
    ...AYQ_CAPTURED_ENTRY_PATHS,
    ...AYQ_CAPTURED_STATEMENT_PATHS.map(path => `__stmt__/${path}`),
  ]);
  const seen = new Map<string, number>();
  let entries = 0;

  for (const content of contents) {
    const document = await ayqParseXml(content);
    const statements = [
      ...ayqFindAll(document, 'Stmt'),
      ...ayqFindAll(document, 'Rpt'),
      ...ayqFindAll(document, 'Ntfctn'),
    ];

    for (const statement of statements) {
      // Извлечението без записите: балансите и обобщенията са контекст на
      // сметката, не на транзакцията, и нарочно остават извън записа.
      const header = { ...(statement as Record<string, unknown>) };
      delete header.Ntry;
      delete header.Bal;
      delete header.TxsSummry;
      const statementPaths = new Map<string, number>();
      collectLeafPaths(header, '', statementPaths);
      for (const [path, count] of statementPaths) {
        const key = `__stmt__/${path}`;
        seen.set(key, (seen.get(key) ?? 0) + count);
      }

      for (const entry of ayqChildren(statement, 'Ntry')) {
        entries += 1;
        const entryPaths = new Map<string, number>();
        collectLeafPaths(entry, '', entryPaths);
        for (const [path, count] of entryPaths) {
          seen.set(path, (seen.get(path) ?? 0) + count);
        }
      }
    }
  }

  const covered: Record<string, number> = {};
  const uncovered: Record<string, number> = {};
  for (const [path, count] of [...seen].sort()) {
    if (captured.has(path)) covered[path] = count;
    else uncovered[path] = count;
  }

  return {
    entries,
    covered,
    uncovered,
    unusedDeclarations: [...captured]
      .filter(path => !seen.has(path))
      .map(path => path.replace(/^__stmt__\//, 'Stmt/'))
      .sort(),
  };
}
