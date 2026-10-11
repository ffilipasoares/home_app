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
 * since the 1st while that's 29 days or fewer, else just what was spent. A
 * category holding a fixed expense (e.g. rent in Habitação) counts as it
 * is, not projected. Estimated savings = income − the projected total.
 */
export function projectMonth(
  spentByCategory: [string, number][],
  fixedCategoryIds: Set<string>,
  income: number,
  days: number,
) {
  const factor = days <= MONTH_DAYS ? MONTH_DAYS / Math.max(days, 1) : 1;
  const rows = spentByCategory.map(([id, spent]) => {
    const fixed = fixedCategoryIds.has(id);
    const estimate = fixed ? spent : spent * factor;
    return { id, spent, estimate, fixed, share: income > 0 ? estimate / income : 0 };
  });
  const total = rows.reduce((sum, r) => sum + r.estimate, 0);
  const savings = income - total;
  return { rows, total, savings, savingsShare: income > 0 ? savings / income : 0 };
}
