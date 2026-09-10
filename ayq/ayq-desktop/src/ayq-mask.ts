// Masking an IBAN before it reaches anything a person can copy out.
//
// An account number identifies somebody. AYQ's account names travel into the
// interface, into screenshots and into CI logs, so what travels is a country
// code and the last four digits — enough to tell two accounts apart and to
// recognise your own, and not enough to be an account number (03 §6.2).
//
// It lives on its own so that both the importer, which names accounts with it,
// and the funds module, which uses it to recognise a transfer between two of
// them, can have it without importing each other.

export function ayqMaskIban(iban: string | null): string | null {
  if (iban === null || iban.length < 6) return null;
  // Deterministic, which is what makes a second import land in the same
  // account rather than in a new one.
  return `AYQ ${iban.slice(0, 2)}…${iban.slice(-4)}`;
}
