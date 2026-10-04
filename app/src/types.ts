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

/** The currencies the dashboard can be shown in (functions/fx.py, DISPLAY_CURRENCIES). */
export const DISPLAY_CURRENCIES = ["EUR", "GBP"] as const;
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];
/** Salaries, fixed expenses and the savings goal are entered in this currency. */
export const ENTRY_CURRENCY: DisplayCurrency = "EUR";

export type UserSettings = {
  savingsGoal: SavingsGoal;
  fixedExpenses: FixedLineItem[];
  /** Which currency the Dashboard shows; remembered across devices. */
  displayCurrency?: DisplayCurrency;
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

export type TransactionSource = "manual-import" | "manual-edit" | "auto" | "bank-sync";

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
  /** Amount in each display currency at the rate for this transaction's date, unrounded; its own currency as-is. */
  amountIn?: Partial<Record<DisplayCurrency, number>>;
  merchantRaw: string;
  merchantNormalized: string;
  category: string | null;
  needsReview: boolean;
  source: TransactionSource;
  confidence?: number;
  /** users/{uid}/accounts/{accountId}, for bank-synced transactions. */
  accountId?: string;
  /** The bank's own transaction id, for bank-synced transactions. */
  externalId?: string;
  /**
   * A move between your own accounts (Revolut EUR <-> GBP exchange). Never
   * categorized and never counted in any dashboard total.
   */
  internalTransfer?: boolean;
  /** Why the AI couldn't categorize this one (cleared once it succeeds). */
  aiError?: string;
  createdAt: number;
  updatedAt: number;
};

/**
 * A linked bank account (users/{uid}/accounts/{accountId}), one doc per
 * account the bank shares under a consent: the Revolut EUR and GBP joint
 * accounts are two docs from one consent. Written only by the Cloud
 * Functions (functions/bank_sync.py); the session credentials themselves
 * live in a server-only collection the app can't read.
 */
export type AccountLink = {
  id: string;
  provider: string;
  /** e.g. "Revolut EUR" */
  displayName: string;
  currency: string;
  /** ms; the bank stops sharing after this and a reconnect is needed. */
  consentExpiresAt: number | null;
  status: "active" | "reconnect-needed" | "disconnected";
  lastError: string | null;
  connectedAt: number;
  lastSyncedAt?: number;
  /** Latest booked transaction date seen, YYYY-MM-DD. */
  lastBookedDate?: string | null;
  lastImportedCount?: number;
};

export type CategoryRule = {
  merchantNormalized: string;
  category: string;
  timesConfirmed: number;
  lastUpdated: number;
};

/** Every dashboard figure in one display currency (functions/dashboard.py). */
export type DashboardView = {
  currency: DisplayCurrency;
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
  /** Categorized transactions not converted into this currency yet, so not in its totals. */
  unconvertedCount: number;
  /** ENTRY_CURRENCY -> this currency rate used for salaries, rent and the goal; null if it couldn't be looked up (they count as 0 then). */
  manualRate: number | null;
  manualRateDate: string;
};

export type DashboardDoc = Partial<Omit<DashboardView, "currency" | "manualRate" | "manualRateDate">> & {
  month: string; // YYYY-MM
  /** Transactions without a category yet. */
  needsReviewCount: number;
  /** One per display currency. Absent on dashboards computed before multi-currency views. */
  views?: Partial<Record<DisplayCurrency, DashboardView>>;
  updatedAt: number;
};
