// The per-category monthly plan.
//
// This one is Actual's, not AYQ's, and that is the whole point of 02 §5.1:
// where the engine already has a capability, AYQ uses it. Actual has a budgeted
// amount per category per month, and in a *tracking* budget it means exactly
// what 03 §7.8 says. Measured at the pinned baseline:
//
//   2026-08  {budgeted: 20000, spent: -5000, balance: 15000}
//   2026-09  {budgeted: 20000, spent:     0, balance: 20000}
//
// August's unused 15 000 does not appear in September. `balance` is `budgeted +
// spent` for that month alone, with no carry-over — "the unused remainder of
// each category plan … does not carry over into the next month". In envelope
// mode it does carry, along with overspending and money assigned in advance,
// which is the arithmetic 01 §4 and 04 A8 say AYQ does not do.
//
// So the budget is a tracking budget, and AYQ says so once, when it opens one.

import api from '@actual-app/api';

import type {
  AyqBudgetCategory,
  AyqBudgetMonth,
} from '../../ayq-client/src/ayq-ipc-contract.ts';

import { ayqCategories } from './ayq-categories.ts';

/** What the budget's type must be for 03 §7.8 to hold. PROVISIONAL. */
export const AYQ_BUDGET_TYPE = 'tracking';

/** What Actual answers for one category in one month. */
type ActualBudgetCategory = {
  id: string;
  name: string;
  is_income?: boolean;
  hidden?: boolean;
  budgeted?: number;
  spent?: number;
};

type ActualBudgetMonth = {
  month: string;
  categoryGroups: Array<{
    id: string;
    name: string;
    hidden?: boolean;
    categories: ActualBudgetCategory[];
  }>;
};

type Send = (name: string, args?: unknown) => Promise<unknown>;

/**
 * Makes this an envelope-free budget, and says so only when it is not already.
 *
 * Writing the `budgetType` preference is what the desktop client's own setting
 * does; the sync layer has a special case for that row which rebuilds the
 * spreadsheet, so both the preferences table and the sheet's own idea of the
 * type agree afterwards. Verified by running it: `forecast/generate` with
 * `source: 'tracking-budget'` refuses unless the preference says `tracking`,
 * and after this it answers.
 *
 * Safe on a budget an earlier AYQ created: switching type recomputes the budget
 * cells, and an AYQ budget from before this change has no budgeted amounts to
 * lose — AYQ never set one.
 */
export async function ayqEnsureTrackingBudget(send: Send): Promise<boolean> {
  const prefs = (await send('preferences/get')) as
    | Record<string, string | undefined>
    | undefined;
  if (prefs?.budgetType === AYQ_BUDGET_TYPE) return false;
  await send('preferences/save', { id: 'budgetType', value: AYQ_BUDGET_TYPE });
  return true;
}

/** What the open budget's type actually is, read rather than assumed. */
export async function ayqBudgetType(send: Send): Promise<string> {
  const prefs = (await send('preferences/get')) as
    | Record<string, string | undefined>
    | undefined;
  // Actual's own default when the preference has never been written.
  return prefs?.budgetType ?? 'envelope';
}

const MONTH = /^\d{4}-\d{2}$/;

/**
 * The months Actual actually keeps a budget for.
 *
 * It builds them for a fixed range — three months before the earliest
 * transaction to twelve months after the current one — and its own API refuses
 * any month outside that, *exclusive* of the last: `validateMonth` tests
 * `range(start, end)`, which does not include `end`. So the twelfth month ahead
 * is readable as a forecast horizon and is not one a plan can be set in.
 *
 * Read rather than assumed, because the range moves with the calendar.
 */
async function budgetMonths(): Promise<string[]> {
  return (await api.getBudgetMonths()) as unknown as string[];
}

/** Every category with nothing planned: what a month outside the range holds. */
async function emptyMonth(month: string): Promise<AyqBudgetMonth> {
  const categories = (await ayqCategories()).map(
    (category): AyqBudgetCategory => ({
      categoryId: category.id,
      categoryName: category.name,
      groupName: category.groupName,
      isIncome: category.isIncome,
      planCents: 0,
      actualCents: 0,
      remainingCents: 0,
      overspentCents: 0,
    }),
  );
  return {
    month,
    editable: false,
    categories,
    totalPlanCents: 0,
    totalActualCents: 0,
    totalRemainingCents: 0,
  };
}

/**
 * The plan, the actual and what is left, for one month.
 *
 * Both figures are stated positive and in the direction the category means:
 * spending for an expense category, money received for an income one. A refund
 * bigger than the month's spending makes the actual negative, which is true and
 * is left true.
 *
 * `remainingCents` is clamped at zero because 03 §7.8 says overspending does
 * not create a negative remainder. What it does create is reported separately,
 * as `overspentCents`, rather than hidden inside a clamp.
 */
export async function ayqBudgetMonth(month: string): Promise<AyqBudgetMonth> {
  if (!MONTH.test(month)) throw new Error('a budget month is YYYY-MM');
  // A month Actual keeps no budget for holds no plan, which is the truth about
  // it rather than an error. Saying so lets the forecast reach its full twelve
  // months without the last of them having to be a refusal.
  if (!(await budgetMonths()).includes(month)) return emptyMonth(month);

  const answer = (await api.getBudgetMonth(month)) as unknown as ActualBudgetMonth;

  const categories: AyqBudgetCategory[] = [];
  for (const group of answer.categoryGroups ?? []) {
    for (const category of group.categories ?? []) {
      const planCents = Number(category.budgeted ?? 0);
      const spent = Number(category.spent ?? 0);
      const isIncome = category.is_income === true;
      const actualCents = isIncome ? spent : -spent;
      categories.push({
        categoryId: category.id,
        categoryName: category.name,
        groupName: group.name,
        isIncome,
        planCents,
        actualCents,
        remainingCents: Math.max(0, planCents - actualCents),
        overspentCents: Math.max(0, actualCents - planCents),
      });
    }
  }

  const expenses = categories.filter(category => !category.isIncome);
  return {
    month,
    editable: true,
    categories,
    totalPlanCents: expenses.reduce((sum, one) => sum + one.planCents, 0),
    totalActualCents: expenses.reduce((sum, one) => sum + one.actualCents, 0),
    totalRemainingCents: expenses.reduce(
      (sum, one) => sum + one.remainingCents,
      0,
    ),
  };
}

/** Sets one category's plan for one month. Zero clears it. */
export async function ayqSetPlan(
  month: string,
  categoryId: string,
  cents: number,
): Promise<AyqBudgetMonth> {
  if (!MONTH.test(month)) throw new Error('a budget month is YYYY-MM');
  if (!Number.isInteger(cents) || cents < 0) {
    throw new Error('a plan is a whole number of cents, and not negative');
  }
  if (!(await budgetMonths()).includes(month)) {
    throw new Error(
      `this budget has no month ${month} to plan in: Actual keeps budget ` +
        'months from three before the earliest transaction to twelve after ' +
        'the current one',
    );
  }
  await api.setBudgetAmount(month, categoryId, cents);
  return ayqBudgetMonth(month);
}
