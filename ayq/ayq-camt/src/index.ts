export { ayqParseCamt, type AyqParseOptions } from './ayq-camt053.ts';
export {
  ayqStripPadding,
  ayqParseXml,
  ayqChild,
  ayqChildren,
  ayqPath,
  ayqText,
  ayqTextAt,
  ayqTextList,
  ayqAttr,
  ayqFindAll,
  type AyqXmlNode,
} from './ayq-xml.ts';
export type {
  AyqAgents,
  AyqAmount,
  AyqBankEntry,
  AyqBankTransactionCode,
  AyqBatch,
  AyqCamtFlavour,
  AyqCharge,
  AyqCurrencyExchange,
  AyqDate,
  AyqEntryPosition,
  AyqParty,
  AyqReferences,
  AyqReturnInformation,
  AyqStatementContext,
  AyqStructuredRemittance,
} from './ayq-types.ts';

export {
  ayqToLegacyTransaction,
  type AyqLegacyTransaction,
} from './ayq-legacy.ts';

export {
  ayqAuditCoverage,
  AYQ_CAPTURED_ENTRY_PATHS,
  AYQ_CAPTURED_STATEMENT_PATHS,
  type AyqCoverageReport,
} from './ayq-coverage.ts';

export { ayqMeasure, type AyqMeasurement } from './ayq-measure.ts';

export {
  ayqResolveCounterparty,
  ayqClassify,
} from './counterparty/ayq-resolve.ts';
export {
  ayqCanonicalName,
  ayqNormaliseKey,
  ayqParseCardDescription,
  ayqParseSepaDescription,
  type AyqCardDescription,
  type AyqSepaDescription,
} from './counterparty/ayq-description.ts';
export {
  AYQ_BANK_NAMES,
  AYQ_DESCRIPTOR_PREFIXES,
  AYQ_INTERMEDIARY_NAMES,
  ayqMatchIntermediaryName,
  ayqStripDescriptorPrefix,
} from './counterparty/ayq-intermediaries.ts';
export type {
  AyqAlias,
  AyqCounterparty,
  AyqCounterpartyLayer,
  AyqEvidence,
  AyqPaymentKind,
  AyqResolveOptions,
} from './counterparty/ayq-counterparty-types.ts';

export {
  ayqCollectTargets,
  ayqLoadTargets,
  ayqReadCamtFile,
  ayqReadCamtZip,
  ayqDecodeCamt,
  type AyqLoadedFile,
  type AyqFailedFile,
  type AyqUnreadable,
} from './ayq-files.ts';
export { ayqReadZip, type AyqZipEntry } from './ayq-zip.ts';
export {
  ayqEvaluateSpike,
  AYQ_R001_EXPECTATIONS,
  type AyqCheck,
  type AyqExpectations,
  type AyqSpikeVerdict,
} from './ayq-verify.ts';
