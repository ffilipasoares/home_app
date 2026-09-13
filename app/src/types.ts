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
 * unaffected by anything you change going forward.
 */
export type MonthlyIncome = {
  /** Manual override; null = use whatever an "income"-special-category transaction shows this month (see DashboardDoc.filipaSalarySource). */
  filipaSalary: number | null;
  /** Always manual — João's salary never lands in this account, so there's nothing to auto-detect. */
  joaoSalary: number | null;
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
  /** Signed: negative = money out, positive = money in, in `currency`. */
  amount: number;
  currency: string;
  /**
   * `amount` converted to the home currency (EUR) — what dashboard totals
   * actually sum (see functions/dashboard.py). Absent for anything already
   * in EUR (no conversion needed); only ever set for a genuinely foreign-
   * currency transaction, written by whatever created it.
   */
  amountHome?: number;
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

/**
 * A linked bank connection (users/{uid}/accounts/{accountId}) — one doc
 * per currency pocket/account the aggregator returns under a single
 * consent (e.g. a Revolut login with EUR and GBP pockets is two docs, one
 * consent). Unused until Phase 2's bank-sync step actually creates these.
 */
export type AccountLink = {
  provider: string;
  displayName: string;
  currency: string;
  lastSyncCursor: string | null;
  consentExpiresAt: number | null;
};

export type CategoryRule = {
  merchantNormalized: string;
  category: string;
  timesConfirmed: number;
  lastUpdated: number;
};

export type DashboardDoc = {
  month: string; // YYYY-MM
  /** The figure actually used in the math: the manual entry if set, else autoDetectedFilipaSalary. */
  filipaSalary: number;
  /** Always the sum of "income"-special-category transactions this month, regardless of any manual entry — shown as a hint on the Dashboard's Filipa's Salary input. */
  autoDetectedFilipaSalary: number;
  filipaSalarySource: "manual" | "auto" | "none";
  /** Always manual — see MonthlyIncome.joaoSalary. */
  joaoSalary: number;
  totalsByCategory: Record<string, number>;
  totalExpenses: number;
  fixedExpensesTotal: number;
  savingsGoalTarget: number;
  savingsActual: number;
  moneyLeft: number;
  needsReviewCount: number;
  updatedAt: number;
};
