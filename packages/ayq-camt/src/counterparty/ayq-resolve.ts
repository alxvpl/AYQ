// Веригата от доказателства за контрагента.
//
// Редът е фиксиран и тръгва от BkTxCd, защото той е налице при всичките 567
// измерени записа, докато контрагентен IBAN липсва при 38 % от тях. BkTxCd не
// произнася име (освен когато контрагентът е самата банка) — той решава кой
// слой има смисъл да бъде питан и в какъв ред.
//
//   1. bank-transaction-code — класифицира; при такса и лихва сам произнася.
//   2. structured           — RltdPties + контрагентен IBAN.
//   3. intermediary         — ако структурираното име е на посредник, спира
//                             приемането: IBAN-ът е негов, не на търговеца.
//   4. description          — разбор на свободния текст.
//   5. alias                — ръчната таблица има последна дума.
//
// Всеки слой оставя следа, включително когато е подминал. Записва се кой слой
// е взел решението.

import type { AyqBankEntry } from '../ayq-types.ts';
import {
  ayqNormaliseKey,
  ayqParseCardDescription,
  ayqParseSepaDescription,
} from './ayq-description.ts';
import {
  AYQ_BANK_NAMES,
  ayqMatchIntermediaryName,
} from './ayq-intermediaries.ts';
import type {
  AyqCounterparty,
  AyqEvidence,
  AyqPaymentKind,
  AyqResolveOptions,
} from './ayq-counterparty-types.ts';

/**
 * BkTxCd → вид плащане. Кодовете са ISO 20022 external codes; изброени са
 * тези, които реално се срещат в измерената сметка, плюс близките им роднини.
 */
const KIND_BY_CODE: Record<string, AyqPaymentKind> = {
  'PMNT/CCRD/POSD': 'card-terminal',
  'PMNT/CCRD/POSP': 'card-terminal',
  'PMNT/CCRD/CWDL': 'card-withdrawal',
  'PMNT/CCRD/CDPT': 'card-withdrawal',
  'PMNT/RDDT/ESDD': 'direct-debit',
  'PMNT/RDDT/UPDD': 'direct-debit',
  'PMNT/RDDT/PMDD': 'direct-debit',
  'PMNT/RDDT/BBDD': 'direct-debit',
  'PMNT/ICDT/ESCT': 'credit-transfer',
  'PMNT/ICDT/DMCT': 'credit-transfer',
  'PMNT/ICDT/AUTT': 'credit-transfer',
  'PMNT/ICDT/STDO': 'credit-transfer',
  'PMNT/RCDT/ESCT': 'credit-transfer',
  'PMNT/RCDT/DMCT': 'credit-transfer',
  'PMNT/RCDT/AUTT': 'credit-transfer',
  'PMNT/MDOP/COMM': 'bank-fee',
  'PMNT/MCOP/COMM': 'bank-fee',
  'ACMT/ACOP/INTR': 'interest',
  'ACMT/MDOP/INTR': 'interest',
};

/** Резервна класификация по семейство, когато точният подкод е непознат. */
const KIND_BY_FAMILY: Record<string, AyqPaymentKind> = {
  CCRD: 'card-terminal',
  RDDT: 'direct-debit',
  ICDT: 'credit-transfer',
  RCDT: 'credit-transfer',
};

export function ayqClassify(entry: AyqBankEntry): AyqPaymentKind {
  if (entry.reversalIndicator === true || entry.returnInformation !== null) {
    return 'reversal';
  }
  const code = entry.bankTransactionCode.code ?? entry.entryBankTransactionCode.code;
  if (code !== null && code in KIND_BY_CODE) return KIND_BY_CODE[code];

  const family =
    entry.bankTransactionCode.family ?? entry.entryBankTransactionCode.family;
  if (family !== null && family in KIND_BY_FAMILY) return KIND_BY_FAMILY[family];

  return 'unknown';
}

function bankName(entry: AyqBankEntry): string | null {
  const bic = entry.statement.accountServicerBic;
  if (bic === null) return null;
  return AYQ_BANK_NAMES[bic.slice(0, 8)] ?? AYQ_BANK_NAMES[bic] ?? bic;
}

function describeCode(entry: AyqBankEntry): string {
  return (
    entry.bankTransactionCode.code ??
    entry.entryBankTransactionCode.code ??
    entry.bankTransactionCode.proprietary ??
    'липсва'
  );
}

/**
 * Разрешава контрагента на един междинен запис.
 *
 * Записът не се променя. Резултатът е отделен обект, който носи и решението,
 * и пътя до него.
 */
export function ayqResolveCounterparty(
  entry: AyqBankEntry,
  options: AyqResolveOptions = {},
): AyqCounterparty {
  const trail: AyqEvidence[] = [];
  const kind = ayqClassify(entry);
  const isDebit = entry.creditDebitIndicator === 'DBIT';

  // ── 1. BkTxCd ──────────────────────────────────────────────────────────
  // Класифицира винаги. Произнася име само когато контрагентът е банката.
  if (kind === 'bank-fee' || kind === 'interest') {
    const name = bankName(entry) ?? entry.additionalEntryInformation;
    trail.push({
      layer: 'bank-transaction-code',
      source: `BkTxCd ${describeCode(entry)}`,
      name,
      iban: null,
      accepted: name !== null,
      note:
        kind === 'bank-fee'
          ? 'Банкова такса — контрагентът е самата банка.'
          : 'Лихва — контрагентът е самата банка.',
    });
    if (name !== null) {
      return finish(entry, trail, {
        name,
        key: ayqNormaliseKey(name),
        iban: null,
        intermediary: null,
        resolvedBy: 'bank-transaction-code',
        kind,
      }, options);
    }
  } else {
    trail.push({
      layer: 'bank-transaction-code',
      source: `BkTxCd ${describeCode(entry)}`,
      name: null,
      iban: null,
      accepted: false,
      note: `Класифицирано като ${kind}; определя реда на следващите слоеве.`,
    });
  }

  // ── 2. structured ──────────────────────────────────────────────────────
  // При дебит контрагентът е кредиторът, при кредит — длъжникът.
  const party = isDebit ? entry.creditor : entry.debtor;
  const structuredName = party.name;
  const structuredIban = party.iban;
  const hasStructured = structuredName !== null || structuredIban !== null;

  // ── 3. intermediary ────────────────────────────────────────────────────
  // Проверява се преди приемането: ако името или IBAN-ът са на посредник,
  // структурираният слой не бива да произнася — той сочи PSP-то.
  const normalisedStructured = ayqNormaliseKey(structuredName);
  const intermediaryByName = ayqMatchIntermediaryName(
    normalisedStructured,
    options.intermediaryNames,
  );
  const intermediaryByIban =
    structuredIban !== null &&
    (options.intermediaryIbans ?? []).includes(structuredIban)
      ? structuredIban
      : null;
  const intermediary = intermediaryByName ?? (intermediaryByIban ? 'известен посредник' : null);

  if (hasStructured) {
    trail.push({
      layer: 'structured',
      source: isDebit
        ? 'RltdPties/Cdtr + CdtrAcct/Id/IBAN'
        : 'RltdPties/Dbtr + DbtrAcct/Id/IBAN',
      name: structuredName,
      iban: structuredIban,
      accepted: intermediary === null,
      note:
        intermediary === null
          ? 'Структурирани данни от банката.'
          : 'Подминато: страната е платежен посредник.',
    });
  } else {
    trail.push({
      layer: 'structured',
      source: 'RltdPties',
      name: null,
      iban: null,
      accepted: false,
      note: 'Записът няма TxDtls — структурирани данни за контрагента липсват.',
    });
  }

  if (intermediary !== null) {
    trail.push({
      layer: 'intermediary',
      source: intermediaryByName !== null ? 'RltdPties/Nm' : 'CdtrAcct/Id/IBAN',
      name: intermediary,
      iban: structuredIban,
      accepted: false,
      note: 'IBAN-ът е на посредника; търговецът се търси в свободния текст.',
    });
  } else if (hasStructured && structuredName !== null) {
    return finish(entry, trail, {
      name: structuredName,
      key: normalisedStructured,
      iban: structuredIban,
      intermediary: null,
      resolvedBy: 'structured',
      kind,
    }, options);
  }

  // ── 4. description ─────────────────────────────────────────────────────
  // Картовият маркер стои в AddtlNtryInf. Когато записът има и RmtInf/Ustrd,
  // суровото описание идва оттам, затова се пробват и двете.
  const fromRemittance = ayqParseCardDescription(entry.rawDescription);
  const card =
    fromRemittance ?? ayqParseCardDescription(entry.additionalEntryInformation);
  if (card !== null && card.merchant !== null) {
    trail.push({
      layer: 'description',
      source: `${card.marker} в ${
        fromRemittance !== null && entry.remittanceUnstructured.length > 0
          ? 'RmtInf/Ustrd'
          : 'AddtlNtryInf'
      }`,
      name: card.merchant,
      iban: null,
      accepted: true,
      note:
        'Търговецът е изваден от свободния текст; терминал, дата, час и номер ' +
        'на картата са отделени, защото правят всеки запис уникален.',
    });
    return finish(entry, trail, {
      name: card.merchant,
      key: ayqNormaliseKey(card.merchant),
      iban: null,
      intermediary: card.intermediary ?? intermediary,
      resolvedBy: 'description',
      kind,
    }, options);
  }

  const sepa = ayqParseSepaDescription(entry.rawDescription);
  // При посредник името в текста е пак неговото; търговецът е в описанието.
  const sepaCandidate =
    intermediary !== null ? (sepa?.remittance ?? null) : (sepa?.name ?? null);
  if (sepaCandidate !== null) {
    trail.push({
      layer: 'description',
      source: intermediary !== null ? 'RmtInf/Ustrd → Omschrijving' : 'RmtInf/Ustrd → Naam',
      name: sepaCandidate,
      iban: sepa?.iban ?? null,
      accepted: true,
      note:
        intermediary !== null
          ? 'Плащане през посредник — името на търговеца е в описанието.'
          : 'Името е изведено от свободния текст на превода.',
    });
    return finish(entry, trail, {
      name: sepaCandidate,
      key: ayqNormaliseKey(sepaCandidate),
      iban: sepa?.iban ?? structuredIban,
      intermediary,
      resolvedBy: 'description',
      kind,
    }, options);
  }

  trail.push({
    layer: 'description',
    source: 'rawDescription',
    name: null,
    iban: null,
    accepted: false,
    note: 'Свободният текст не съвпада с позната форма.',
  });

  // Няма име, но може да има IBAN — той сам по себе си е групиращ признак.
  if (structuredIban !== null && intermediary === null) {
    return finish(entry, trail, {
      name: null,
      key: structuredIban,
      iban: structuredIban,
      intermediary: null,
      resolvedBy: 'structured',
      kind,
    }, options);
  }

  // Остана само името на посредника. То се пази, защото е единственото, но
  // решението не се приписва на структурирания слой — иначе всяко плащане през
  // PSP щеше да изглежда решено, докато търговецът всъщност е неизвестен.
  if (intermediary !== null) {
    trail.push({
      layer: 'intermediary',
      source: 'RltdPties/Nm',
      name: intermediary,
      iban: structuredIban,
      accepted: false,
      note:
        'Търговецът не е намерен; записът остава групиран под посредника, ' +
        'докато не бъде добавен псевдоним.',
    });
    return finish(entry, trail, {
      name: structuredName,
      key: normalisedStructured,
      iban: null,
      intermediary,
      resolvedBy: 'unresolved',
      kind,
    }, options);
  }

  return finish(entry, trail, {
    name: structuredName,
    key: normalisedStructured,
    iban: structuredIban,
    intermediary: null,
    resolvedBy: structuredName === null ? 'unresolved' : 'structured',
    kind,
  }, options);
}

/**
 * Последният слой: ръчната таблица с псевдоними.
 *
 * Съвпада по IBAN, по SEPA мандат или по нормализиран ключ — в този ред,
 * защото IBAN-ът и мандатът са по-специфични от името.
 */
function finish(
  entry: AyqBankEntry,
  trail: AyqEvidence[],
  resolved: Omit<AyqCounterparty, 'trail' | 'mandateId'>,
  options: AyqResolveOptions,
): AyqCounterparty {
  const mandateId =
    entry.references.mandateId ??
    ayqParseSepaDescription(entry.rawDescription)?.mandateId ??
    null;

  const aliases = options.aliases ?? [];
  const alias =
    aliases.find(item => item.iban && item.iban === resolved.iban) ??
    aliases.find(item => item.mandateId && item.mandateId === mandateId) ??
    aliases.find(item => item.key && item.key === resolved.key);

  if (alias) {
    trail.push({
      layer: 'alias',
      source: alias.iban
        ? 'псевдоним по IBAN'
        : alias.mandateId
          ? 'псевдоним по мандат'
          : 'псевдоним по ключ',
      name: alias.name,
      iban: resolved.iban,
      accepted: true,
      note: 'Ръчният псевдоним има последна дума.',
    });
    return {
      ...resolved,
      name: alias.name,
      key: ayqNormaliseKey(alias.name),
      mandateId,
      resolvedBy: 'alias',
      trail,
    };
  }

  return { ...resolved, mandateId, trail };
}
