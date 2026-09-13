import { getFirestore } from "firebase-admin/firestore";
import type { CategoryDef, DashboardDoc, MonthlyIncome, Transaction, UserSettings } from "./types";

const DEFAULT_SETTINGS: UserSettings = {
  savingsGoal: { type: "fixed", value: 0 },
  fixedExpenses: [],
};

const DEFAULT_MONTHLY_INCOME: MonthlyIncome = { salary: null, fixedIncomes: [] };

/**
 * Recomputes users/{uid}/dashboards/{month} from scratch: transactions for
 * the month, plus that month's own income record (see monthlyIncome/{month}
 * — a per-month value on purpose, so recomputing October never changes
 * what August's dashboard says), plus the global fixed-expenses/savings-goal
 * settings. Always a full re-sum rather than an incremental +/- — at one
 * household's transaction volume this is cheap, and it means the result is
 * correct even if a write is retried or edited repeatedly (see
 * onTransactionWrite/onMonthlyIncomeWrite in index.ts).
 */
export async function recomputeMonth(uid: string, month: string): Promise<void> {
  const db = getFirestore();
  const userRef = db.collection("users").doc(uid);

  const [txSnap, categoriesSnap, settingsSnap, monthlyIncomeSnap] = await Promise.all([
    userRef.collection("transactions").where("month", "==", month).get(),
    userRef.collection("settings").doc("categories").get(),
    userRef.get(),
    userRef.collection("monthlyIncome").doc(month).get(),
  ]);

  const categories: CategoryDef[] = (categoriesSnap.data()?.categories as CategoryDef[] | undefined) ?? [];
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const settings: UserSettings = { ...DEFAULT_SETTINGS, ...(settingsSnap.data() as Partial<UserSettings> | undefined) };
  const monthlyIncome: MonthlyIncome = {
    ...DEFAULT_MONTHLY_INCOME,
    ...(monthlyIncomeSnap.data() as Partial<MonthlyIncome> | undefined),
  };

  let autoDetectedSalary = 0;
  let savingsActual = 0;
  let totalExpenses = 0;
  let needsReviewCount = 0;
  const totalsByCategory: Record<string, number> = {};

  for (const doc of txSnap.docs) {
    const tx = doc.data() as Transaction;
    if (tx.needsReview || !tx.category) {
      needsReviewCount += 1;
      continue;
    }
    const def = categoryById.get(tx.category);
    if (def?.special === "income") {
      autoDetectedSalary += tx.amount;
      continue;
    }
    if (def?.special === "savings") {
      savingsActual += Math.abs(tx.amount);
      continue;
    }
    const spend = Math.abs(Math.min(0, tx.amount)); // only money out counts as an expense
    if (spend === 0) continue;
    totalsByCategory[tx.category] = (totalsByCategory[tx.category] ?? 0) + spend;
    totalExpenses += spend;
  }

  // The manual, per-month entry is authoritative when present (it's the
  // number you sat down and confirmed for this specific month) — it
  // doesn't add to the auto-detected figure, it replaces it, so a
  // categorized transaction and a manual entry never double-count.
  const salary = monthlyIncome.salary ?? autoDetectedSalary;
  const salarySource: DashboardDoc["salarySource"] =
    monthlyIncome.salary !== null ? "manual" : autoDetectedSalary > 0 ? "auto" : "none";

  const fixedExpensesTotal = settings.fixedExpenses.reduce((sum, item) => sum + item.amount, 0);
  const fixedIncomesTotal = monthlyIncome.fixedIncomes.reduce((sum, item) => sum + item.amount, 0);
  const totalIncome = salary + fixedIncomesTotal;

  const savingsGoalTarget =
    settings.savingsGoal.type === "fixed" ? settings.savingsGoal.value : (settings.savingsGoal.value / 100) * totalIncome;

  // Money left is what's actually left — income minus real spend — not
  // further reduced by the savings goal, which is a target compared
  // against via savingsActual/savingsGoalTarget, not a guaranteed outflow.
  const moneyLeft = totalIncome - totalExpenses - fixedExpensesTotal;

  const dashboard: DashboardDoc = {
    month,
    salary,
    autoDetectedSalary,
    salarySource,
    totalsByCategory,
    totalExpenses,
    fixedExpensesTotal,
    fixedIncomesTotal,
    savingsGoalTarget,
    savingsActual,
    moneyLeft,
    needsReviewCount,
    updatedAt: Date.now(),
  };

  await userRef.collection("dashboards").doc(month).set(dashboard);
}
