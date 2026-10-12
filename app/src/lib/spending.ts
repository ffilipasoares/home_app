import { amountShown } from "./transactionFilters";
import type { CategoryDef, DisplayCurrency, Transaction } from "../types";

/**
 * How much of a transaction counts as spending in the app currency, the
 * same way the Dashboard counts it (functions/dashboard.py): money out in a
 * confirmed category, not a move between your own accounts, not salary and
 * not investments. 0 for anything else.
 */
export function spendOf(tx: Transaction, categories: CategoryDef[], currency: DisplayCurrency): number {
  if (tx.internalTransfer || tx.needsReview || !tx.category) return 0;
  const special = categories.find((c) => c.id === tx.category)?.special;
  if (special === "income" || special === "savings") return 0;
  const shown = amountShown(tx, currency);
  return shown !== undefined && shown < 0 ? -shown : 0;
}
