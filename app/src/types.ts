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
 * — e.g. rent paid from a different account. Entered in Settings and
 * folded into the monthly math alongside whatever the imported
 * transactions show. Unlike salary/income (see MonthlyIncome below) this
 * stays a single global value — assumed stable month to month; revisit if
 * that stops being true for you.
 */
export type FixedLineItem = {
  id: string;
  label: string;
  amount: number;
};

export type UserSettings = {
  savingsGoal: SavingsGoal;
  fixedExpenses: FixedLineItem[];
};

/**
 * Income for one specific month, entered/confirmed on the Dashboard itself
 * — not global Settings — precisely so it's a per-month historical record:
 * scrolling back to review July shows what July's income actually was,
 * unaffected by anything you change going forward. `salary: null` means
 * "not manually confirmed for this month, use whatever an 'income'-special
 * category transaction shows" (see DashboardDoc.salarySource).
 */
export type MonthlyIncome = {
  salary: number | null;
  /** e.g. a partner's salary/contribution that never lands in this account. */
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
  month: string; // YYYY-MM — the budget month, editable independent of date (see updateTransactionMonth)
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
  /** The figure actually used in the math: the manual entry if set, else autoDetectedSalary. */
  salary: number;
  /** Always the sum of "income"-special-category transactions this month, regardless of any manual entry — shown as a hint on the Dashboard's salary input. */
  autoDetectedSalary: number;
  salarySource: "manual" | "auto" | "none";
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
