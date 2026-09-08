// Proof of losslessness.
//
// "Nothing is lost" is a claim, not a property — so here it is checkable. The
// audit walks the raw XML under every <Ntry>, collects all leaf paths and
// compares them against the declared list of what is read. Whatever is left
// over is reported with a hit count. An empty result means the record really
// does carry everything the bank gave.
//
// The list is maintained by hand on purpose: when the bank adds a field, the
// audit says so instead of the parser silently passing it by.

import {
  ayqChildren,
  ayqParseXml,
  ayqFindAll,
  type AyqXmlNode,
} from './ayq-xml.ts';

/** The paths of one party and its account, relative to RltdPties. */
function partyPaths(party: string, account: string | null): string[] {
  const paths = [
    `RltdPties/${party}/Nm`,
    `RltdPties/${party}/PstlAdr/Ctry`,
    `RltdPties/${party}/PstlAdr/AdrLine`,
    `RltdPties/${party}/Id/OrgId/Othr/Id`,
    `RltdPties/${party}/Id/PrvtId/Othr/Id`,
    `RltdPties/${party}/Id/PrvtId/Othr/SchmeNm/Cd`,
    `RltdPties/${party}/Id/PrvtId/Othr/SchmeNm/Prtry`,
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

/** The BkTxCd paths under a given prefix. */
function bankCodePaths(prefix: string): string[] {
  return [
    `${prefix}/Domn/Cd`,
    `${prefix}/Domn/Fmly/Cd`,
    `${prefix}/Domn/Fmly/SubFmlyCd`,
    `${prefix}/Prtry/Cd`,
    `${prefix}/Prtry/Issr`,
  ];
}

/** The AmtDtls paths under a given prefix. */
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

/** The Chrgs paths under a given prefix — with and without a nested <Rcrd>. */
function chargePaths(prefix: string): string[] {
  const fields = ['Amt', 'CdtDbtInd', 'Br', 'Pty/FinInstnId/BIC'];
  return [
    ...fields.map(field => `${prefix}/${field}`),
    ...fields.map(field => `${prefix}/Rcrd/${field}`),
  ];
}

/** The RtrInf paths under a given prefix. */
function returnPaths(prefix: string): string[] {
  return [
    `${prefix}/Rsn/Cd`,
    `${prefix}/Rsn/Prtry`,
    `${prefix}/Orgtr/Nm`,
    `${prefix}/AddtlInf`,
    ...bankCodePaths(`${prefix}/OrgnlBkTxCd`),
  ];
}

/** Everything the intermediate record reads under one <Ntry>. */
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

/** Everything the intermediate record reads outside <Ntry>. */
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
  /** How many <Ntry> were walked. */
  entries: number;
  /** Paths the parser reads, with hit counts. */
  covered: Record<string, number>;
  /** Paths present in the XML that the record does not read. */
  uncovered: Record<string, number>;
  /** Declared paths with no hit at all in this data. */
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
  const childKeys = Object.keys(record).filter(
    key => key !== '$' && key !== '_',
  );
  if (childKeys.length === 0) {
    // An element with only attributes and/or text — that is a leaf.
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
 * Compares what the XML contains with what the intermediate record reads.
 *
 * Takes the raw content of one or more CAMT files.
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
      // The statement without its entries: balances and summaries are context
      // of the account, not of a transaction, and stay outside the record on
      // purpose.
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
