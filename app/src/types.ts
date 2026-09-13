// Shared types for the app. Mirrors the Firestore schema in
// docs/ARCHITECTURE.md §6 — keep the two in sync when either changes.
// The Cloud Functions project (functions/src) has its own copy of the
// category defaults for its own runtime; see the note there.

export type SavingsGoal = {
  type: "fixed" | "percent";
  /** A € amount when type is "fixed", or a 0-100 percent-of-income when "percent". */
  value: number;
};

/**
 * A recurring amount that never shows up as a transaction in this account
 * — e.g. rent paid from a different account, or a partner's income/
 * contribution that doesn't land here. Entered once in Settings and folded
 * into the monthly math alongside whatever the imported transactions show.
 */
export type FixedLineItem = {
  id: string;
  label: string;
  amount: number;
};

export type UserSettings = {
  /** Fallback used when no "income"-special-category transaction is found this month. */
  defaultSalary: number;
  savingsGoal: SavingsGoal;
  fixedExpenses: FixedLineItem[];
  fixedIncomes: FixedLineItem[];
};

export type CategoryDef = {
  id: string;
  label: string;
  /**
   * Income and savings-transfer categories are excluded from
   * totalsByCategory/totalExpenses — they feed the salary figure /
   * savings-goal progress instead.
   */
  special?: "income" | "savings";
};

export type TransactionSource = "manual-import" | "manual-edit" | "auto";

export type Transaction = {
  id: string;
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM, derived from date
  /** Signed: negative = money out, positive = money in. */
  amount: number;
  currency: string;
  merchantRaw: string;
  merchantNormalized: string;
  category: string | null;
  needsReview: boolean;
  source: TransactionSource;
  confidence?: number;
  accountId?: string;
  createdAt: number;
  updatedAt: number;
};

export type CategoryRule = {
  merchantNormalized: string;
  category: string;
  timesConfirmed: number;
  lastUpdated: number;
};

export type DashboardDoc = {
  month: string; // YYYY-MM
  /** Detected "income"-category transactions this month, or defaultSalary if none. */
  salary: number;
  totalsByCategory: Record<string, number>;
  totalExpenses: number;
  fixedExpensesTotal: number;
  fixedIncomesTotal: number;
  savingsGoalTarget: number;
  savingsActual: number;
  moneyLeft: number;
  needsReviewCount: number;
  updatedAt: number;
};
