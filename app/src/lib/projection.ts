import { ENTRY_CURRENCY, UNCATEGORIZED_FIXED, type CategoryDef, type DashboardView, type FixedLineItem } from "../types";

// The month length the projection assumes, as in the household spreadsheet.
export const MONTH_DAYS = 29;

/** Days since the 1st of `month` (YYYY-MM) up to today: on 11 October, 10. */
export function daysSinceMonthStart(month: string, today = new Date()): number {
  const start = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1);
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((now.getTime() - start.getTime()) / 86_400_000);
}

/**
 * The spreadsheet's projection, per category: spending so far × 29 ÷ days
 * since the 1st while that's 29 days or fewer, else just what was spent.
 * The fixed-expense part of a category (e.g. rent inside Needs) counts as
 * it is; only the rest of the category is projected. Estimated savings =
 * income − the projected total.
 */
export function projectMonth(
  spentByCategory: [string, number][],
  fixedByCategory: Record<string, number>,
  income: number,
  days: number,
) {
  const factor = days <= MONTH_DAYS ? MONTH_DAYS / Math.max(days, 1) : 1;
  const rows = spentByCategory.map(([id, spent]) => {
    const fixed = Math.min(fixedByCategory[id] ?? 0, spent);
    const variable = spent - fixed;
    const estimate = fixed + variable * factor;
    return { id, spent, fixed, variable, estimate, share: income > 0 ? estimate / income : 0 };
  });
  const total = rows.reduce((sum, r) => sum + r.estimate, 0);
  const savings = income - total;
  return { rows, total, savings, savingsShare: income > 0 ? savings / income : 0 };
}

/** How a category's estimate was made, for its row: "Fixed, as is", "460,70 £ so far" or "2100,00 £ fixed + 651,32 £ so far". */
export function projectionNote(
  row: { fixed: number; variable: number },
  fmt: (n: number) => string,
): string {
  if (row.fixed > 0 && row.variable > 0.005) return `${fmt(row.fixed)} fixed + ${fmt(row.variable)} so far`;
  if (row.fixed > 0) return "Fixed, as is";
  return `${fmt(row.variable)} so far`;
}

/**
 * The fixed-expense part of each category's total in a dashboard view.
 * Newer dashboards carry it (functions/dashboard.py, fixedByCategory); for
 * older ones it's worked out here from the fixed expenses in Settings at
 * the view's rates. Fixed expenses in an investments category aren't
 * spending, so they're left out.
 */
export function fixedByCategoryOf(
  view: DashboardView,
  fixedExpenses: FixedLineItem[],
  categories: CategoryDef[],
): Record<string, number> {
  if (view.fixedByCategory) return view.fixedByCategory;
  const out: Record<string, number> = {};
  for (const item of fixedExpenses) {
    const category = categories.find((c) => c.id === item.category);
    if (category?.special === "savings") continue;
    const rate = view.rates[item.currency ?? ENTRY_CURRENCY] ?? 0;
    const key = category ? category.id : UNCATEGORIZED_FIXED;
    out[key] = (out[key] ?? 0) + item.amount * rate;
  }
  return out;
}
