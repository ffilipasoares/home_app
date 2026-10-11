import type { CategoryDef, Transaction } from "../types";

// Matches CONFIDENCE_THRESHOLD in functions/categorize.py: below it the
// AI's category is still applied, but marked so you know to double-check.
export const AI_SURE_THRESHOLD = 0.7;

/** What the row says instead of a category while there isn't a confirmed one. */
export function categoryState(tx: Transaction, category: CategoryDef | undefined): string {
  if (tx.internalTransfer) return "Between your accounts · not counted";
  if (tx.needsReview && !tx.category) return tx.aiError ? "AI couldn't categorize yet" : "Categorizing…";
  return category?.label ?? tx.category ?? "Not categorized";
}
