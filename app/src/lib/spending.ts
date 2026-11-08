import { amountShown } from "./transactionFilters";
import { isNotCounted } from "./transactionState";
import type { CategoryDef, DisplayCurrency, Transaction } from "../types";

/**
 * What a transaction adds to spending in the app currency, the same way the
 * Dashboard counts it (functions/dashboard.py): money out in a confirmed
 * spending category adds, money back in to one (a refund, a friend paying
 * their half) takes off. 0 for anything not counted (moves between your own
 * accounts, ones you marked "Don't count this"), salary,
 * investments and anything not categorized yet.
 */
export function netSpendOf(tx: Transaction, categories: CategoryDef[], currency: DisplayCurrency): number {
  if (isNotCounted(tx) || tx.needsReview || !tx.category) return 0;
  const special = categories.find((c) => c.id === tx.category)?.special;
  if (special === "income" || special === "savings") return 0;
  const shown = amountShown(tx, currency);
  return shown === undefined ? 0 : -shown;
}
