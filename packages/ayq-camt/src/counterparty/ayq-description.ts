// Разбор на свободния текст.
//
// Това е слоят, който съществува само защото банката не дава друго. При 201-те
// картови и банкоматни записа структурирано поле за търговеца няма изобщо:
// името е в низ, който носи и терминал, и дата, и час, и номер на картата, и
// затова 201 записа дават 201 различни имена. Тук този низ се разглобява на
// части, от които името е една.
//
// Разборът е по форма, не по банка-специфична магия: каквото не съвпадне,
// връща null и слоят подминава, вместо да гадае.

import {
  ayqStripDescriptorPrefix,
} from './ayq-intermediaries.ts';

/** Картов или банкоматен запис, разглобен на съставните си части. */
export type AyqCardDescription = {
  /** BEA (терминал) или GEA (банкомат). */
  marker: 'BEA' | 'GEA';
  /** Начин на плащане, ако е посочен: Betaalpas, Apple Pay, Google Pay… */
  method: string | null;
  /** Търговецът както е изписан, без префикс на acquirer. */
  merchant: string | null;
  /** Разпознат acquirer от префикса на дескриптора (`CCV*…`). */
  intermediary: string | null;
  /** Последните цифри на картата от `,PAS123`. */
  card: string | null;
  /** Номерът на терминала от `NR:…`. */
  terminal: string | null;
  /** Датата и часът от `31.05.26/23:10`, непроменени. */
  timestamp: string | null;
  /** Каквото остава след часа: град или адрес на сайта. */
  location: string | null;
};

/** SEPA запис, разглобен по етикети или по слаш-тагове. */
export type AyqSepaDescription = {
  /** Видът, както банката го е изписал: „SEPA Incasso“, „SEPA iDEAL“… */
  scheme: string | null;
  name: string | null;
  iban: string | null;
  bic: string | null;
  /** MARF / „Machtiging“ — SEPA мандатът от свободния текст. */
  mandateId: string | null;
  /** CSID / „Incassant“ — идентификаторът на кредитора при директен дебит. */
  creditorId: string | null;
  /** EREF / „Kenmerk“. */
  reference: string | null;
  /** REMI / „Omschrijving“ — това, което търговецът е написал. */
  remittance: string | null;
};

const CARD_MARKER = /^\s*(BEA|GEA)\b[\s,]*/i;

const CARD_METHOD =
  /^(Betaalpas|Betaalpas contactloos|Apple Pay|Google Pay|Garmin Pay|Fitbit Pay|Swatch Pay|Contactloos|NFC|Geldautomaat)\b[\s,]*/i;

const CARD_PAS = /,\s*PAS\s*(\d+)/i;
const CARD_TERMINAL = /\bNR[:\s]\s*([^\s,]+)/i;
const CARD_TIMESTAMP = /\b(\d{2}\.\d{2}\.\d{2}\s*\/\s*\d{2}[:.]\d{2})/;
const LEADING_TERMINAL = /^\s*NR[:\s]\s*[^\s,]+\s*,?\s*/i;
const LEADING_TIMESTAMP = /^\s*\d{2}\.\d{2}\.\d{2}\s*\/\s*\d{2}[:.]\d{2}\s*,?\s*/;

function tidy(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const cleaned = value.replace(/\s+/g, ' ').replace(/^[\s,]+|[\s,]+$/g, '');
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Разглобява картов или банкоматен запис.
 *
 * Поддържа и двете подредби, които ABN AMRO е използвала:
 *   BEA, Betaalpas   ALBERT HEIJN 1234,PAS123 NR:00A1B2, 31.05.26/23:10 AMSTERDAM
 *   BEA   NR:00A1B2   31.05.26/23:10   ALBERT HEIJN 1234,PAS123
 *
 * Връща null, когато низът не е картов запис — тогава слоят подминава.
 */
export function ayqParseCardDescription(
  raw: string | null,
): AyqCardDescription | null {
  if (!raw) return null;
  const markerMatch = raw.match(CARD_MARKER);
  if (!markerMatch) return null;

  const marker = markerMatch[1].toUpperCase() === 'GEA' ? 'GEA' : 'BEA';
  let body = raw.slice(markerMatch[0].length);

  const methodMatch = body.match(CARD_METHOD);
  const method = methodMatch ? methodMatch[1] : null;
  if (methodMatch) body = body.slice(methodMatch[0].length);

  const pasMatch = body.match(CARD_PAS);
  // Текстът преди `,PAS` е търговецът; след него са техническите полета.
  // Когато `,PAS` липсва, целият остатък се третира като кандидат и
  // техническите полета се свалят поотделно.
  const head = pasMatch ? body.slice(0, pasMatch.index) : body;
  const tail = pasMatch ? body.slice((pasMatch.index ?? 0) + pasMatch[0].length) : body;

  let merchantRaw = head
    .replace(LEADING_TERMINAL, '')
    .replace(LEADING_TIMESTAMP, '')
    .replace(LEADING_TERMINAL, '');

  if (!pasMatch) {
    // Без `,PAS` техническите полета може да са навсякъде — свалят се на място.
    merchantRaw = merchantRaw
      .replace(CARD_TERMINAL, ' ')
      .replace(CARD_TIMESTAMP, ' ');
  }

  const stripped = ayqStripDescriptorPrefix(tidy(merchantRaw) ?? '');
  const terminalMatch = tail.match(CARD_TERMINAL) ?? raw.match(CARD_TERMINAL);
  const timestampMatch = tail.match(CARD_TIMESTAMP) ?? raw.match(CARD_TIMESTAMP);

  let location: string | null = null;
  if (timestampMatch && timestampMatch.index !== undefined) {
    const source = tail.match(CARD_TIMESTAMP) ? tail : raw;
    location = tidy(source.slice(
      (source.match(CARD_TIMESTAMP)?.index ?? 0) + timestampMatch[0].length,
    ));
  }

  return {
    marker,
    method: tidy(method),
    merchant: tidy(stripped.merchant),
    intermediary: stripped.intermediary,
    card: pasMatch ? pasMatch[1] : null,
    terminal: terminalMatch ? terminalMatch[1] : null,
    timestamp: timestampMatch ? tidy(timestampMatch[1]) : null,
    location,
  };
}

// Слаш-таговете на ABN AMRO: /TRTP/…/IBAN/…/NAME/…/REMI/…
const SLASH_TAGS = new Set([
  'TRTP',
  'CSID',
  'MARF',
  'EREF',
  'IBAN',
  'BIC',
  'NAME',
  'REMI',
  'RTRN',
  'ORDP',
  'PREF',
  'SWOD',
]);

function parseSlashTags(raw: string): Record<string, string> | null {
  if (!raw.trimStart().startsWith('/')) return null;
  const tokens = raw.trim().split('/');
  const fields: Record<string, string> = {};
  let current: string | null = null;
  for (const token of tokens) {
    if (SLASH_TAGS.has(token)) {
      current = token;
      fields[current] = '';
    } else if (current !== null) {
      // Стойността може да съдържа наклонена черта; долепя се обратно.
      fields[current] = fields[current] ? `${fields[current]}/${token}` : token;
    }
  }
  return Object.keys(fields).length > 0 ? fields : null;
}

// Етикетите, с които ABN AMRO пише същото на нидерландски.
const LABELS: Array<[string, RegExp]> = [
  ['name', /\bNaam[:\s]/i],
  ['iban', /\bIBAN[:\s]/i],
  ['bic', /\bBIC[:\s]/i],
  ['mandateId', /\bMachtiging(?:\s*ID)?[:\s]/i],
  ['creditorId', /\bIncassant(?:\s*ID)?[:\s]/i],
  ['reference', /\b(?:Kenmerk|Betalingskenmerk)[:\s]/i],
  ['remittance', /\bOmschrijving[:\s]/i],
];

function parseLabels(raw: string): Record<string, string> {
  const hits: Array<{ field: string; start: number; end: number }> = [];
  for (const [field, pattern] of LABELS) {
    const match = raw.match(pattern);
    if (match && match.index !== undefined) {
      hits.push({
        field,
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }
  hits.sort((a, b) => a.start - b.start);

  const fields: Record<string, string> = {};
  hits.forEach((hit, index) => {
    const stop = index + 1 < hits.length ? hits[index + 1].start : raw.length;
    const value = tidy(raw.slice(hit.end, stop));
    if (value !== null) fields[hit.field] = value;
  });
  return fields;
}

/** Число или референция накрая: номер на клон, на терминал, на поръчка, дата. */
const TRAILING_NOISE = /\s+(?:\d{1,8}|(?=[A-Z0-9]*\d)[A-Z0-9]{5,})$/;

const IBAN_ANYWHERE = /\b([A-Z]{2}\d{2}[A-Z0-9]{10,30})\b/;
const SCHEME = /^\s*(SEPA[^,\n]{0,40}?)(?=\s{2,}|\s+(?:Incassant|Naam|IBAN|Machtiging|Omschrijving|Kenmerk)\b|[,\n]|$)/i;

/**
 * Разглобява SEPA запис — и в двете форми, които банката произвежда:
 * слаш-тагове (`/TRTP/…/NAME/…`) и нидерландски етикети (`Naam: …`).
 */
export function ayqParseSepaDescription(
  raw: string | null,
): AyqSepaDescription | null {
  if (!raw) return null;

  const slash = parseSlashTags(raw);
  if (slash) {
    return {
      scheme: tidy(slash.TRTP ?? null),
      name: tidy(slash.NAME ?? null),
      iban: tidy(slash.IBAN ?? null),
      bic: tidy(slash.BIC ?? null),
      mandateId: tidy(slash.MARF ?? null),
      creditorId: tidy(slash.CSID ?? null),
      reference: tidy(slash.EREF ?? slash.PREF ?? null),
      remittance: tidy(slash.REMI ?? null),
    };
  }

  const labels = parseLabels(raw);
  const schemeMatch = raw.match(SCHEME);
  const ibanMatch = raw.match(IBAN_ANYWHERE);
  const hasContent =
    Object.keys(labels).length > 0 || schemeMatch !== null || ibanMatch !== null;
  if (!hasContent) return null;

  return {
    scheme: schemeMatch ? tidy(schemeMatch[1]) : null,
    name: labels.name ?? null,
    iban: labels.iban ?? (ibanMatch ? ibanMatch[1] : null),
    bic: labels.bic ?? null,
    mandateId: labels.mandateId ?? null,
    creditorId: labels.creditorId ?? null,
    reference: labels.reference ?? null,
    remittance: labels.remittance ?? null,
  };
}

/**
 * Нормализиран ключ за групиране.
 *
 * Главни букви, без диакритика, без пунктуация, без опашка от номера накрая —
 * така „Albert Heijn 1234“ и „ALBERT HEIJN 5678“ падат в едно, а номерът на
 * поръчката не прави всяка покупка отделен контрагент.
 *
 * Цената е приета съзнателно: име, чиято последна дума е число, го губи в
 * ключа („Testwinkel 24“ → „TESTWINKEL“). Ключът се ползва само за групиране;
 * показваното име остава каквото банката го е дала.
 */
export function ayqNormaliseKey(value: string | null): string | null {
  if (!value) return null;
  const folded = value
    .normalize('NFD')
    // Диакритиката се маха отделно: иначе класът по-долу я заменя с интервал
    // и „CAFÉ“ става „CAF E“.
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();
  const cleaned = folded
    .replace(/[^A-Z0-9&+ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length === 0) return null;

  // Опашката от номера пада най-много три пъти: номер на клон, номер на
  // поръчка, дата. Дума без цифра спира свалянето.
  let key = cleaned;
  for (let index = 0; index < 3; index += 1) {
    const trimmed = key.replace(TRAILING_NOISE, '').trim();
    if (trimmed === key || trimmed.length === 0) break;
    key = trimmed;
  }
  return key.length > 0 ? key : cleaned;
}
