import { getFirestore } from "firebase-admin/firestore";
import type { CategoryDef, DashboardDoc, Transaction, UserSettings } from "./types";

const DEFAULT_SETTINGS: UserSettings = {
  defaultSalary: 0,
  savingsGoal: { type: "fixed", value: 0 },
};

/**
 * Recomputes users/{uid}/dashboards/{month} from scratch by summing that
 * month's transactions. Always a full re-sum rather than an incremental
 * +/- — at one user's transaction volume this is cheap, and it means the
 * result is correct even if a write is retried or a category is edited
 * repeatedly (see onTransactionWrite in index.ts).
 */
export async function recomputeMonth(uid: string, month: string): Promise<void> {
  const db = getFirestore();
  const userRef = db.collection("users").doc(uid);

  const [txSnap, categoriesSnap, settingsSnap] = await Promise.all([
    userRef.collection("transactions").where("month", "==", month).get(),
    userRef.collection("settings").doc("categories").get(),
    userRef.get(),
  ]);

  const categories: CategoryDef[] = (categoriesSnap.data()?.categories as CategoryDef[] | undefined) ?? [];
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const settings: UserSettings = (settingsSnap.data() as UserSettings | undefined) ?? DEFAULT_SETTINGS;

  let salary = 0;
  let savingsActual = 0;
  let neededTotal = 0;
  let discretionaryTotal = 0;
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
      salary += tx.amount;
      continue;
    }
    if (def?.special === "savings") {
      savingsActual += Math.abs(tx.amount);
      continue;
    }
    const spend = Math.abs(Math.min(0, tx.amount)); // only money out counts as an expense
    if (spend === 0) continue;
    totalsByCategory[tx.category] = (totalsByCategory[tx.category] ?? 0) + spend;
    const needed = tx.needed ?? def?.needed ?? false;
    if (needed) neededTotal += spend;
    else discretionaryTotal += spend;
  }

  if (salary === 0) salary = settings.defaultSalary;

  const savingsGoalTarget =
    settings.savingsGoal.type === "fixed" ? settings.savingsGoal.value : (settings.savingsGoal.value / 100) * salary;

  const moneyLeft = salary - neededTotal - discretionaryTotal - savingsGoalTarget;

  const dashboard: DashboardDoc = {
    month,
    salary,
    totalsByCategory,
    neededTotal,
    discretionaryTotal,
    savingsGoalTarget,
    savingsActual,
    moneyLeft,
    needsReviewCount,
    updatedAt: Date.now(),
  };

  await userRef.collection("dashboards").doc(month).set(dashboard);
}
