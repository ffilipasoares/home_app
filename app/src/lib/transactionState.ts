import type { CategoryDef, Transaction } from "../types";

// Matches CONFIDENCE_THRESHOLD in functions/categorize.py: below it the
// AI's category is still applied, but marked so you know to double-check.
export const AI_SURE_THRESHOLD = 0.7;

/**
 * Left out of every total: a move between your own accounts (found by the
 * sync) or one you marked "Don't count this". Same rule as
 * functions/dashboard.py.
 */
export function isNotCounted(tx: Transaction): boolean {
  return !!(tx.internalTransfer || tx.ignored);
}

/** What the row says instead of a category while there isn't a confirmed one. */
export function categoryState(tx: Transaction, category: CategoryDef | undefined): string {
  if (tx.internalTransfer) return "Between your accounts · not counted";
  if (tx.ignored) return category ? `${category.label} · not counted` : "Not counted";
  if (tx.needsReview && !tx.category) return tx.aiError ? "AI couldn't categorize yet" : "Categorizing…";
  return category?.label ?? tx.category ?? "Not categorized";
}
