// Платежни посредници: когато контрагентният IBAN е техен, той не идентифицира
// търговеца. При iDEAL и картовите плащания това е правило, не изключение —
// парите минават през сметка на PSP-то и истинското име седи в свободния текст.
//
// Списъкът е по име и по префикс в картовия дескриптор. IBAN-и нарочно няма:
// вградени непроверени IBAN-и биха давали тихи грешни отговори. Известните
// IBAN-и се добавят от потребителя през AyqResolveOptions.intermediaryIbans,
// след като са видени в собствените данни.

/** Име на посредник, търсено като подниз в нормализираното име на страната. */
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
 * Префикси в картовия дескриптор: `CCV*BAKKERIJ JANSEN` означава, че CCV е
 * acquirer-ът, а „BAKKERIJ JANSEN“ е търговецът. Стойността е името на
 * посредника, което се записва в AyqCounterparty.intermediary.
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

/** BIC на банката → четимо име. Само за случаите, в които банката е контрагент. */
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
 * Разпознава посредник по име. Търси подниз в нормализираното име, затова
 * „Stichting Mollie Payments“ и „MOLLIE B.V.“ дават един и същ отговор.
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
 * Сваля префикса на acquirer-а от картов дескриптор.
 * Връща и остатъка, и разпознатия посредник.
 */
export function ayqStripDescriptorPrefix(descriptor: string): {
  merchant: string;
  intermediary: string | null;
} {
  for (const [pattern, name] of AYQ_DESCRIPTOR_PREFIXES) {
    if (pattern.test(descriptor)) {
      return { merchant: descriptor.replace(pattern, '').trim(), intermediary: name };
    }
  }
  return { merchant: descriptor, intermediary: null };
}
