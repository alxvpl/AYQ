// Date arithmetic on YYYY-MM-DD strings.
//
// Every date AYQ handles is a calendar day the bank stated, not an instant: a
// direct debit collected on the 31st is the 31st in Amsterdam whatever the
// machine's timezone is set to. So the arithmetic is done on the string through
// UTC, and nothing here ever reads the clock — the forecast takes `today` as an
// argument, which is what makes the whole of 03 §7 testable.

/** YYYY-MM-DD as its three numbers. */
function parts(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day };
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

export function ayqDate(year: number, month: number, day: number): string {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/** Days in a month, 1-indexed. */
export function ayqDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function ayqAddDays(date: string, count: number): string {
  const moment = new Date(`${date}T00:00:00Z`);
  moment.setUTCDate(moment.getUTCDate() + count);
  return moment.toISOString().slice(0, 10);
}

/**
 * Adds whole months, keeping the day of the month where the month has one.
 *
 * The 31st of January plus one month is the 28th of February, and plus two is
 * the 31st of March — because the series is generated from the start date with
 * an index rather than by stepping from the previous result. Stepping would
 * lose the 31st permanently after the first February, and a mortgage collected
 * on the last day of the month would drift to the 28th for ever.
 */
export function ayqAddMonths(date: string, count: number): string {
  const { year, month, day } = parts(date);
  const zero = year * 12 + (month - 1) + count;
  const targetYear = Math.floor(zero / 12);
  const targetMonth = (zero % 12) + 1;
  return ayqDate(
    targetYear,
    targetMonth,
    Math.min(day, ayqDaysInMonth(targetYear, targetMonth)),
  );
}

/** The whole days from one date to another; negative when `to` is earlier. */
export function ayqDaysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );
}

/** "2026-09-14" as "2026-09". */
export function ayqMonthOf(date: string): string {
  return date.slice(0, 7);
}

/** "2026-09" as "2026-09-01". */
export function ayqMonthStart(month: string): string {
  return `${month}-01`;
}

/** "2026-09" as "2026-09-30". */
export function ayqMonthEnd(month: string): string {
  const [year, index] = month.split('-').map(Number);
  return ayqDate(year, index, ayqDaysInMonth(year, index));
}

/** "2026-09" plus n months. */
export function ayqAddMonthsToMonth(month: string, count: number): string {
  return ayqMonthOf(ayqAddMonths(ayqMonthStart(month), count));
}

/** The months from one to another, inclusive, in order. */
export function ayqMonthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  let cursor = from;
  // Bounded so a reversed or malformed pair cannot spin: no question AYQ asks
  // spans more than a couple of decades.
  for (let step = 0; step < 600 && cursor <= to; step += 1) {
    months.push(cursor);
    cursor = ayqAddMonthsToMonth(cursor, 1);
  }
  return months;
}
