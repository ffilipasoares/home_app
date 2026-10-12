import type { DashboardDoc, DashboardView, DisplayCurrency } from "../types";

/**
 * The figures for one currency. Dashboards computed before multi-currency
 * views only have the EUR figures at the top level; those still show in EUR
 * (GBP appears once the month is recalculated).
 */
export function viewFor(dashboard: DashboardDoc | null, currency: DisplayCurrency): DashboardView | null {
  if (!dashboard) return null;
  const view = dashboard.views?.[currency];
  if (view) return { ...view, rates: view.rates ?? { [currency]: 1 }, missingRate: view.missingRate ?? false };
  if (currency !== "EUR" || dashboard.moneyLeft === undefined) return null;
  return {
    currency: "EUR",
    filipaSalary: dashboard.filipaSalary ?? 0,
    autoDetectedFilipaSalary: dashboard.autoDetectedFilipaSalary ?? 0,
    filipaSalarySource: dashboard.filipaSalarySource ?? "none",
    joaoSalary: dashboard.joaoSalary ?? 0,
    totalsByCategory: dashboard.totalsByCategory ?? {},
    totalExpenses: dashboard.totalExpenses ?? 0,
    fixedExpensesTotal: dashboard.fixedExpensesTotal ?? 0,
    savingsGoalTarget: dashboard.savingsGoalTarget ?? 0,
    moneyLeft: dashboard.moneyLeft,
    unconvertedCount: dashboard.unconvertedCount ?? 0,
    rates: { EUR: 1 },
    rateDate: "",
    missingRate: false,
  };
}
