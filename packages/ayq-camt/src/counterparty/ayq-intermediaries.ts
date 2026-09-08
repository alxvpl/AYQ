// Payment intermediaries: when the counterparty IBAN is theirs, it does not
// identify the merchant. For iDEAL and card payments this is the rule, not the
// exception — the money passes through a PSP account and the real name sits in
// the free text.
//
// The list matches on names and on card-descriptor prefixes. There are
// deliberately no IBANs: unverified built-in IBANs would produce silent wrong
// answers. Known ones are supplied by the user through
// AyqResolveOptions.intermediaryIbans, once seen in their own data.

/** An intermediary name, looked for as a substring of the normalised name. */
export const AYQ_INTERMEDIARY_NAMES: string[] = [
  'MOLLIE',
  'ADYEN',
  'BUCKAROO',
  'STRIPE',
  'PAY NL',
  'PAY.NL',
  'MULTISAFEPAY',
  'SISOW',
  'WORLDLINE',
  'INGENICO',
  'GLOBAL COLLECT',
  'CCV',
  'SUMUP',
  'ZETTLE',
  'IZETTLE',
  'BRAINTREE',
  'CHECKOUT COM',
  'KLARNA',
  'PAYPAL',
  'DOCDATA',
  'TARGETPAY',
  'ONLINE BETAALPLATFORM',
  'OPP',
  'SHOPIFY PAYMENTS',
  'SQUARE',
];

/**
 * Card-descriptor prefixes: `CCV*BAKKERIJ JANSEN` means CCV is the acquirer
 * and "BAKKERIJ JANSEN" is the merchant. The value is the intermediary name
 * recorded in AyqCounterparty.intermediary.
 */
export const AYQ_DESCRIPTOR_PREFIXES: Array<[RegExp, string]> = [
  [/^CCV\s*\*/i, 'CCV'],
  [/^ZTL\s*\*/i, 'Zettle'],
  [/^IZ\s*\*/i, 'iZettle'],
  [/^SUMUP\s*\*/i, 'SumUp'],
  [/^SQ\s*\*/i, 'Square'],
  [/^MSP\s*\*/i, 'MultiSafepay'],
  [/^PAY\.?NL\s*\*/i, 'PAY.nl'],
  [/^MOLLIE\s*\*/i, 'Mollie'],
  [/^ADYEN\s*\*/i, 'Adyen'],
  [/^BUCKAROO\s*\*/i, 'Buckaroo'],
  [/^STRIPE\s*\*/i, 'Stripe'],
  [/^PAYPAL\s*\*/i, 'PayPal'],
  [/^KLARNA\s*\*/i, 'Klarna'],
];

/** Bank BIC to a readable name. Only for the cases where the bank is a party. */
export const AYQ_BANK_NAMES: Record<string, string> = {
  ABNANL2A: 'ABN AMRO Bank',
  INGBNL2A: 'ING Bank',
  RABONL2U: 'Rabobank',
  SNSBNL2A: 'SNS Bank',
  TRIONL2U: 'Triodos Bank',
  BUNQNL2A: 'bunq',
  KNABNL2H: 'Knab',
  ASNBNL21: 'ASN Bank',
  RBRBNL21: 'RegioBank',
};

/**
 * Recognises an intermediary by name. Matches a substring of the normalised
 * name, so "Stichting Mollie Payments" and "MOLLIE B.V." give the same answer.
 */
export function ayqMatchIntermediaryName(
  normalisedName: string | null,
  extraNames: string[] = [],
): string | null {
  if (!normalisedName) return null;
  for (const candidate of [...AYQ_INTERMEDIARY_NAMES, ...extraNames]) {
    const needle = candidate.toUpperCase();
    if (normalisedName.includes(needle)) return candidate;
  }
  return null;
}

/**
 * Strips the acquirer prefix from a card descriptor.
 * Returns both the remainder and the intermediary it recognised.
 */
export function ayqStripDescriptorPrefix(descriptor: string): {
  merchant: string;
  intermediary: string | null;
} {
  for (const [pattern, name] of AYQ_DESCRIPTOR_PREFIXES) {
    if (pattern.test(descriptor)) {
      return {
        merchant: descriptor.replace(pattern, '').trim(),
        intermediary: name,
      };
    }
  }
  return { merchant: descriptor, intermediary: null };
}
