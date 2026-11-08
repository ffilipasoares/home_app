import { amountShown } from "./transactionFilters";
import { isNotCounted } from "./transactionState";
import type { CategoryDef, DisplayCurrency, Transaction } from "../types";

// How far back an expense can be for money that pays it back.
const LOOK_BACK_DAYS = 120;
const LOOK_AHEAD_DAYS = 7; // an expense added by hand a few days late
const MAX_SHOWN = 30;

function dayOffset(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Expenses that money coming in (a friend's share of a dinner) can be linked
 * to: counted spending in a regular category, around the payback's date,
 * newest first, filtered by name, note or amount.
 */
export function paybackCandidates(
  payback: Transaction,
  all: Transaction[],
  categories: CategoryDef[],
  search: string,
): Transaction[] {
  const spending = new Set(categories.filter((c) => !c.special).map((c) => c.id));
  const from = dayOffset(payback.date, -LOOK_BACK_DAYS);
  const to = dayOffset(payback.date, LOOK_AHEAD_DAYS);
  const q = search.trim().toLowerCase();
  return all
    .filter(
      (tx) =>
        tx.amount < 0 &&
        !!tx.category &&
        spending.has(tx.category) &&
        !tx.needsReview &&
        !isNotCounted(tx) &&
        tx.date >= from &&
        tx.date <= to &&
        (!q || [tx.merchantRaw, tx.note ?? "", String(Math.abs(tx.amount))].join(" ").toLowerCase().includes(q)),
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_SHOWN);
}

/** The money paid back for an expense, in the app currency, and by whom. */
export function paidBackFor(expense: Transaction, all: Transaction[], currency: DisplayCurrency) {
  const paybacks = all.filter((tx) => tx.paysBack === expense.id && !isNotCounted(tx));
  const total = paybacks.reduce((sum, tx) => sum + (amountShown(tx, currency) ?? 0), 0);
  return { paybacks, total };
}
