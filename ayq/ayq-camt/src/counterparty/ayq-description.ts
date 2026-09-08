// Parsing the free text.
//
// This layer exists only because the bank gives nothing else. On the 201 card
// and ATM entries there is no structured merchant field at all: the name sits
// inside a string that also carries the terminal, the date, the time and the
// card number, which is why 201 entries produce 201 distinct names. Here that
// string is taken apart, and the name is one of the parts.
//
// Parsing is by shape, not by bank-specific magic: whatever does not match
// returns null and the layer passes, rather than guessing.

import {
  ayqStripDescriptorPrefix,
} from './ayq-intermediaries.ts';

/** A card or ATM entry, taken apart into its constituents. */
export type AyqCardDescription = {
  /** BEA (terminal) or GEA (ATM). */
  marker: 'BEA' | 'GEA';
  /** The payment method when stated: Betaalpas, Apple Pay, Google Pay… */
  method: string | null;
  /** The merchant as written, without the acquirer prefix. */
  merchant: string | null;
  /** The acquirer recognised from the descriptor prefix (`CCV*…`). */
  intermediary: string | null;
  /** The card's trailing digits, from `,PAS123`. */
  card: string | null;
  /** The terminal number, from `NR:…`. */
  terminal: string | null;
  /** The date and time from `31.05.26/23:10`, unchanged. */
  timestamp: string | null;
  /** Whatever follows the time: a city or a website address. */
  location: string | null;
};

/** A SEPA entry, taken apart by labels or by slash tags. */
export type AyqSepaDescription = {
  /** The scheme as the bank wrote it: "SEPA Incasso", "SEPA iDEAL"… */
  scheme: string | null;
  name: string | null;
  iban: string | null;
  bic: string | null;
  /** MARF / "Machtiging" — the SEPA mandate from the free text. */
  mandateId: string | null;
  /** CSID / "Incassant" — the creditor identifier on a direct debit. */
  creditorId: string | null;
  /** EREF / "Kenmerk". */
  reference: string | null;
  /** REMI / "Omschrijving" — what the merchant wrote. */
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
 * Takes a card or ATM entry apart.
 *
 * Supports both orderings ABN AMRO has used:
 *   BEA, Betaalpas   ALBERT HEIJN 1234,PAS123 NR:00A1B2, 31.05.26/23:10 AMSTERDAM
 *   BEA   NR:00A1B2   31.05.26/23:10   ALBERT HEIJN 1234,PAS123
 *
 * Returns null when the string is not a card entry — the layer then passes.
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
  // The text before `,PAS` is the merchant; after it come the technical
  // fields. When `,PAS` is absent the whole remainder is treated as the
  // candidate and the technical fields are stripped individually.
  const head = pasMatch ? body.slice(0, pasMatch.index) : body;
  const tail = pasMatch ? body.slice((pasMatch.index ?? 0) + pasMatch[0].length) : body;

  let merchantRaw = head
    .replace(LEADING_TERMINAL, '')
    .replace(LEADING_TIMESTAMP, '')
    .replace(LEADING_TERMINAL, '');

  if (!pasMatch) {
    // Without `,PAS` the technical fields may sit anywhere — strip in place.
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

// ABN AMRO's slash tags: /TRTP/…/IBAN/…/NAME/…/REMI/…
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
      // A value may contain a slash; it is joined back together.
      fields[current] = fields[current] ? `${fields[current]}/${token}` : token;
    }
  }
  return Object.keys(fields).length > 0 ? fields : null;
}

// The labels ABN AMRO uses to write the same thing in Dutch.
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

/** A trailing number or reference: branch, terminal, order number, date. */
const TRAILING_NOISE = /\s+(?:\d{1,8}|(?=[A-Z0-9]*\d)[A-Z0-9]{5,})$/;

const IBAN_ANYWHERE = /\b([A-Z]{2}\d{2}[A-Z0-9]{10,30})\b/;
const SCHEME = /^\s*(SEPA[^,\n]{0,40}?)(?=\s{2,}|\s+(?:Incassant|Naam|IBAN|Machtiging|Omschrijving|Kenmerk)\b|[,\n]|$)/i;

/**
 * Takes a SEPA entry apart, in both forms the bank produces: slash tags
 * (`/TRTP/…/NAME/…`) and Dutch labels (`Naam: …`).
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
 * The normalised grouping key.
 *
 * Upper case, no diacritics, no punctuation, no trailing run of numbers — so
 * "Albert Heijn 1234" and "ALBERT HEIJN 5678" fall together, and an order
 * number does not make every purchase its own counterparty.
 *
 * The cost is accepted knowingly: a name whose last word is a number loses it
 * in the key ("Testwinkel 24" -> "TESTWINKEL"). The key is only ever used for
 * grouping; the display name stays as the bank gave it.
 */
export function ayqNormaliseKey(value: string | null): string | null {
  if (!value) return null;
  const folded = value
    .normalize('NFD')
    // Diacritics are stripped separately: otherwise the character class
    // below replaces them with a space and "CAFÉ" becomes "CAF E".
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();
  const cleaned = folded
    .replace(/[^A-Z0-9&+ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length === 0) return null;

  // The trailing run of numbers is stripped at most three times: branch
  // number, order number, date. A word without a digit stops it.
  let key = cleaned;
  for (let index = 0; index < 3; index += 1) {
    const trimmed = key.replace(TRAILING_NOISE, '').trim();
    if (trimmed === key || trimmed.length === 0) break;
    key = trimmed;
  }
  return key.length > 0 ? key : cleaned;
}
