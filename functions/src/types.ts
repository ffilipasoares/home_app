// Subset of app/src/types.ts this function actually reads/writes. Keep the
// shapes in sync with the app if you change the Firestore schema — see
// docs/ARCHITECTURE.md §6 for the source of truth.

export type CategoryDef = {
  id: string;
  label: string;
  needed: boolean;
  special?: "income" | "savings";
};

export type SavingsGoal = {
  type: "fixed" | "percent";
  value: number;
};

export type UserSettings = {
  defaultSalary: number;
  savingsGoal: SavingsGoal;
};

export type Transaction = {
  id: string;
  date: string;
  month: string;
  amount: number;
  currency: string;
  merchantRaw: string;
  merchantNormalized: string;
  category: string | null;
  needed: boolean | null;
  needsReview: boolean;
  source: "manual-import" | "manual-edit" | "auto";
  confidence?: number;
  accountId?: string;
  createdAt: number;
  updatedAt: number;
};

export type DashboardDoc = {
  month: string;
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
