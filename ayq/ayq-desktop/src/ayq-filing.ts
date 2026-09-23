// Filing a transaction without being told. 03 §11.10–§11.14.
//
// Until r014 of 03, AYQ was explicitly *not* required to guess a category
// without a rule or a manual decision. Applied to a real store that turned out
// to be a trap: the owner ran build 005 against his own statements, got the
// whole starter taxonomy provisioned and five hundred and sixty-seven
// transactions sitting in `Uncategorised`, with no way forward but to file
// every one of them by hand. 04 A6 has said since the beginning that the
// product is not designed on the assumption that every imported transaction
// permanently needs an individual human decision. r014 makes AYQ do the filing.
//
// ## What this is allowed to conclude from
//
// Only evidence AYQ already holds about the transaction (§11.10): the payment
// class the bank stated in `BkTxCd`, and the canonical counterparty. Nothing
// here looks at an amount to decide a category, because the size of a payment
// is not evidence of what it was for.
//
// ## What it refuses to conclude
//
// `Uncategorised` stays the answer wherever the evidence does not carry one
// (§11.13). `Other` is a category the owner may choose; it is not a bin for
// what AYQ could not decide, and filing to it to empty Review would be lying
// about how much AYQ knows.
//
// Three things are never filed here at all: a transfer between the owner's own
// accounts (§11.6, §7.6 — money moving is not spending), a reversal or refund
// (§9 owns those and reduces the original expense rather than filing a new
// one), and Actual's `Starting Balances` technical object (§11.8).
//
// Money coming *in* is left alone as well. A credit could be salary, a refund
// nobody flagged as one, a transfer from an account AYQ has not been shown, or
// a friend paying back dinner, and the difference matters to the whole income
// side of the forecast (§7.7). AYQ has no evidence that separates them, so it
// does not pretend to.
//
// ## Why it may act without being asked
//
// Because §11.11 makes what it does cheap to undo. An automatic assignment is
// recorded as automation. A learned rule outranks it — a rule is the owner's
// own generalisation about a counterparty. A decision made by hand outranks
// both and is never overwritten. It may revise its own earlier work and only
// its own. Everything it did is visible, and putting it right is one decision
// in Review, not five hundred.

import {
  ayqNormaliseKey,
} from '../../ayq-camt/src/counterparty/ayq-description.ts';
import type { AyqFilingReason } from '../../ayq-client/src/ayq-ipc-contract.ts';

/** What AYQ concluded, and the evidence it concluded it from. */
export type AyqFiling = {
  categoryName: string;
  /**
   * Why, so a person can check it. §11.11 requires the assignment to be
   * verifiable, and "because a table said so" is not verifiable unless the
   * table says which line matched. A code and the matched line; the words are
   * the catalogue's (04 A24).
   */
  reason: AyqFilingReason;
};

/** Everything this decision is allowed to see. */
export type AyqFilingEvidence = {
  /** The payment class from `BkTxCd`, as the importer recorded it. */
  kind: string | null;
  /** The name the resolver pronounced for the counterparty. */
  counterpartyName: string | null;
  amountCents: number;
  /** A reversal or refund, per its own bank evidence (§9.4). */
  reversal: boolean;
  /** A movement between the owner's own accounts (§7.6). */
  transfer: boolean;
  /** Actual's technical starting-balance row (§11.8). */
  startingBalance: boolean;
};

/**
 * The counterparties AYQ recognises, and where each belongs.
 *
 * A shipped table, and deliberately a short one. Every line is a merchant or an
 * institution whose business is not in doubt — a supermarket sells groceries, a
 * network operator sells connectivity — because a line that is only usually
 * right costs the owner a correction every time it is wrong, and §11.13 would
 * rather leave the transaction unfiled than make him check.
 *
 * Matching is on the normalised key, so punctuation and case do not matter, and
 * on whole words, so `NS` does not match `TRANSAVIA`. The table is working
 * material and not canon (§11.14): the owner may correct anything it decides,
 * and the correction outranks it permanently (§4.4).
 *
 * The names here are Dutch-market because the owner's statements are; the
 * mechanism is not.
 */
const MERCHANTS: Array<[string, readonly string[]]> = [
  [
    'Groceries',
    [
      'ALBERT HEIJN', 'AH TO GO', 'AH XL', 'JUMBO', 'LIDL', 'ALDI',
      'PLUS SUPERMARKT', 'SPAR', 'VOMAR', 'HOOGVLIET', 'EKOPLAZA',
      'PICNIC', 'CRISP', 'NETTORAMA', 'POIESZ', 'DIRK VD BROEK',
    ],
  ],
  [
    'Eating out',
    [
      'THUISBEZORGD', 'UBER EATS', 'DELIVEROO', 'MCDONALDS', 'MC DONALDS',
      'BURGER KING', 'KFC', 'SUBWAY', 'DOMINOS', 'NEW YORK PIZZA', 'STARBUCKS',
      'LA PLACE', 'FEBO', 'SMULLERS', 'HMSHOST', 'RESTAURANT', 'CAFETARIA',
      'BAKKERIJ', 'COFFEECOMPANY',
    ],
  ],
  [
    'Household',
    ['ACTION', 'BLOKKER', 'XENOS', 'IKEA', 'PRAXIS', 'GAMMA', 'KARWEI', 'HORNBACH'],
  ],
  [
    'Phone & Internet',
    [
      'ODIDO', 'KPN', 'VODAFONE', 'ZIGGO', 'T MOBILE', 'TELE2', 'SIMYO',
      'LEBARA', 'LYCAMOBILE', 'YOUFONE', 'OPENFIBER', 'DELTA FIBER',
      'CAIWAY', 'FREEDOM INTERNET',
    ],
  ],
  [
    'Utilities',
    [
      'VATTENFALL', 'ENECO', 'ESSENT', 'GREENCHOICE', 'BUDGET ENERGIE',
      'VANDEBRON', 'OXXIO', 'ENGIE', 'WATERNET', 'VITENS', 'DUNEA', 'EVIDES',
      'BRABANT WATER', 'PWN', 'WATERBEDRIJF',
    ],
  ],
  [
    'Insurance',
    [
      'ZILVEREN KRUIS', 'MENZIS', 'VGZ', 'CZ GROEP', 'ACHMEA', 'INTERPOLIS',
      'CENTRAAL BEHEER', 'UNIVE', 'DITZO', 'FBTO', 'AEGON', 'NATIONALE NEDERLANDEN', 'ASR', 'OHRA', 'INSHARED', 'ANDERZORG', 'VERZEKERING',
    ],
  ],
  [
    'Subscriptions',
    [
      'NETFLIX', 'SPOTIFY', 'DISNEY PLUS', 'VIAPLAY', 'HBO MAX', 'AMAZON PRIME',
      'YOUTUBEPREMIUM', 'ADOBE', 'MICROSOFT', 'GOOGLE STORAGE', 'APPLE COM',
      'DROPBOX', 'OPENAI', 'ANTHROPIC', 'VIMEXX', 'TRANSIP', 'STRATO',
      'HOSTNET', 'ANTAGONIST', 'GITHUB',
    ],
  ],
  [
    'Public transport',
    [
      'NS GROEP', 'NS REIZIGERS', 'OV CHIPKAART', 'TRANSLINK', 'GVB', 'RET',
      'HTM', 'CONNEXXION', 'ARRIVA', 'QBUZZ', 'FLIXBUS', 'BLABLACAR',
    ],
  ],
  [
    'Car & fuel',
    [
      'SHELL', 'BP', 'ESSO', 'TOTALENERGIES', 'TANGO', 'TINQ',
      'TAMOIL', 'AVIA', 'FIREZONE', 'GULF', 'TEXACO', 'ANWB', 'FASTNED',
      'ALLEGO', 'SHELL RECHARGE', 'BOVAG',
    ],
  ],
  [
    'Parking & road tax',
    [
      'Q PARK', 'QPARK', 'PARKMOBILE', 'PARKEREN', 'PARKING', 'INTERPARKING',
      'RDW', 'YELLOWBRICK', 'EASYPARK',
    ],
  ],
  [
    'Health & pharmacy',
    [
      'APOTHEEK', 'TANDARTS', 'HUISARTS', 'ZIEKENHUIS', 'FYSIOTHERAPIE',
      'OPTIEK', 'PEARLE', 'SPECSAVERS', 'HANS ANDERS', 'TANDARTSPRAKTIJK',
    ],
  ],
  [
    'Personal care',
    ['KRUIDVAT', 'ETOS', 'TREKPLEISTER', 'DOUGLAS', 'RITUALS', 'KAPSALON', 'KAPPER'],
  ],
  [
    'Shopping',
    [
      'BOL COM', 'COOLBLUE', 'AMAZON', 'ZALANDO', 'HEMA', 'MEDIAMARKT',
      'PRIMARK', 'H&M', 'ZARA', 'C&A', 'DECATHLON', 'INTERTOYS', 'WEHKAMP',
      'ALIEXPRESS', 'TEMU', 'SHEIN', 'BIJENKORF',
    ],
  ],
  [
    'Entertainment',
    [
      'PATHE', 'VUE CINEMA', 'KINEPOLIS', 'STEAM GAMES', 'STEAMGAMES',
      'PLAYSTATION', 'XBOX', 'NINTENDO', 'TICKETMASTER', 'PARADISO',
      'AHOY', 'ZIGGO DOME', 'EFTELING', 'ARTIS',
    ],
  ],
  [
    'Travel',
    [
      'BOOKING COM', 'AIRBNB', 'TRANSAVIA', 'KLM', 'RYANAIR', 'EASYJET',
      'TUI', 'CORENDON', 'EXPEDIA', 'HOTEL', 'SUNWEB',
    ],
  ],
  [
    'Gifts & donations',
    [
      'UNICEF', 'GREENPEACE', 'RODE KRUIS', 'KWF', 'ARTSEN ZONDER GRENZEN',
      'AMNESTY', 'WNF', 'OXFAM', 'HARTSTICHTING', 'GIRO555',
    ],
  ],
  [
    'Taxes & government',
    [
      'BELASTINGDIENST', 'GEMEENTE', 'CJIB', 'DUO', 'WATERSCHAP',
      'HOOGHEEMRAADSCHAP', 'RIJKSOVERHEID', 'KVK', 'CBR',
    ],
  ],
  [
    'Bank fees',
    ['ABN AMRO KOSTEN', 'BANKKOSTEN', 'KOSTEN BETALINGSVERKEER'],
  ],
];

/** A whole-word match, so a short pattern cannot hide inside a longer word. */
function carries(key: string, pattern: string): boolean {
  const wanted = pattern.trim();
  if (wanted.length === 0) return false;
  return (
    key === wanted ||
    key.startsWith(`${wanted} `) ||
    key.endsWith(` ${wanted}`) ||
    key.includes(` ${wanted} `)
  );
}

/**
 * Where this transaction belongs, or nothing.
 *
 * Pure, so it can be tested without a budget, and so that what AYQ concludes
 * from one transaction's evidence cannot depend on anything else in the store.
 */
export function ayqProposedCategory(
  evidence: AyqFilingEvidence,
): AyqFiling | null {
  // The three §11.13 exclusions, before anything else is considered.
  if (evidence.startingBalance) return null;
  if (evidence.transfer) return null;
  if (evidence.reversal) return null;
  if (evidence.kind === 'reversal') return null;

  // Money coming in is not filed. See the note at the top of this file.
  if (evidence.amountCents >= 0) return null;

  // The bank charging for its own services is the one case the payment class
  // settles on its own: 03 §3.2 makes the bank itself the counterparty, so
  // there is nothing to look up.
  if (evidence.kind === 'bank-fee') {
    return { categoryName: 'Bank fees', reason: { code: 'bank-charge' } };
  }
  if (evidence.kind === 'interest') {
    return { categoryName: 'Bank fees', reason: { code: 'bank-interest' } };
  }

  // Cash out of a machine says nothing about what the cash was then spent on,
  // and 03 §3.2 leaves whether it has a counterparty at all OPEN. Unfiled.
  if (evidence.kind === 'card-withdrawal') return null;

  const key = ayqNormaliseKey(evidence.counterpartyName);
  if (key === null) return null;

  for (const [categoryName, patterns] of MERCHANTS) {
    for (const pattern of patterns) {
      if (carries(key, pattern)) {
        return {
          categoryName,
          reason: { code: 'counterparty', counterparty: pattern.trim() },
        };
      }
    }
  }

  return null;
}

/** Every category this classification can ever propose, for a test to check. */
export function ayqFilingCategories(): string[] {
  return [...new Set(MERCHANTS.map(([name]) => name)), 'Bank fees'].sort();
}
