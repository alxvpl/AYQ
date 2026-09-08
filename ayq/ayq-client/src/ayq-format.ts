// Turning the engine's numbers into something a person reads.
//
// The engine stores integer cents and ISO dates; both are exact and neither is
// how anyone speaks. Nothing here computes money — it only renders it.

const AMOUNT = new Intl.NumberFormat('nl-NL', {
  style: 'currency',
  currency: 'EUR',
});

export function ayqEuro(cents: number): string {
  return AMOUNT.format(cents / 100);
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "2026-06-30" as "30 Jun 2026" — shorter, and unambiguous in any locale. */
export function ayqDay(date: string): string {
  const [year, month, day] = date.split('-');
  const name = MONTHS[Number(month) - 1]?.slice(0, 3) ?? month;
  return `${Number(day)} ${name} ${year}`;
}

/** "2026-06" as "June 2026". */
export function ayqMonth(month: string): string {
  const [year, index] = month.split('-');
  return `${MONTHS[Number(index) - 1] ?? month} ${year}`;
}

/** An ISO timestamp as a local date and time, to the minute. */
export function ayqMoment(iso: string): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return iso;
  return `${ayqDay(when.toISOString().slice(0, 10))}, ${when
    .toTimeString()
    .slice(0, 5)}`;
}
