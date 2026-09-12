// Shared types for the app. Mirrors the Firestore schema in
// docs/ARCHITECTURE.md §6 — keep the two in sync when either changes.
// The Cloud Functions project (functions/src) has its own copy of the
// category defaults for its own runtime; see the note there.

export type SavingsGoal = {
  type: "fixed" | "percent";
  /** A € amount when type is "fixed", or a 0-100 percent-of-salary when "percent". */
  value: number;
};

export type UserSettings = {
  defaultSalary: number;
  savingsGoal: SavingsGoal;
};

export type CategoryDef = {
  id: string;
  label: string;
  needed: boolean;
  /**
   * Income and savings-transfer categories are excluded from "expenses" —
   * they feed the salary figure / savings-goal progress instead. Everything
   * else counts toward totalsByCategory / neededTotal / discretionaryTotal.
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
  needed: boolean | null;
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
  needed: boolean;
  timesConfirmed: number;
  lastUpdated: number;
};

export type DashboardDoc = {
  month: string; // YYYY-MM
  salary: number;
  totalsByCategory: Record<string, number>;
  neededTotal: number;
  discretionaryTotal: number;
  savingsGoalTarget: number;
  savingsActual: number;
  moneyLeft: number;
  needsReviewCount: number;
  updatedAt: number;
};
