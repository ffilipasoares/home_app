import type { CategoryDef, DisplayCurrency, Transaction } from "../types";

/** The amount in the app currency, or undefined if it isn't converted yet. */
export function amountShown(tx: Transaction, currency: DisplayCurrency): number | undefined {
  if (tx.currency === currency) return tx.amount;
  return tx.amountIn?.[currency] ?? (currency === "EUR" ? tx.amountHome : undefined);
}

export type Filters = {
  search: string;
  category: string; // "all" | "none" (uncategorized) | category id
  direction: "all" | "out" | "in";
  source: string; // "all" | "manual" | "csv" | bank account id
  allMonths: boolean;
};

export const NO_FILTERS: Filters = { search: "", category: "all", direction: "all", source: "all", allMonths: false };

export function sourceKey(tx: Transaction): string {
  if (tx.addedManually) return "manual";
  if (tx.accountId) return tx.accountId;
  return "csv";
}

export function matches(tx: Transaction, f: Filters, categories: CategoryDef[], currency: DisplayCurrency): boolean {
  if (f.category === "none" ? !!tx.category : f.category !== "all" && tx.category !== f.category) return false;
  if (f.direction === "out" && tx.amount >= 0) return false;
  if (f.direction === "in" && tx.amount < 0) return false;
  if (f.source !== "all" && sourceKey(tx) !== f.source) return false;

  const q = f.search.trim().toLowerCase();
  if (!q) return true;
  const label = categories.find((c) => c.id === tx.category)?.label ?? "";
  const shown = amountShown(tx, currency);
  // Amounts match as typed, with either decimal separator ("12.37" or "12,37").
  const amounts = [Math.abs(tx.amount), shown === undefined ? null : Math.abs(shown)]
    .filter((n): n is number => n !== null)
    .map((n) => n.toFixed(2));
  const haystack = [tx.merchantRaw, label, tx.date, ...amounts].join(" ").toLowerCase();
  return q
    .split(/\s+/)
    .every((word) => haystack.includes(word.replace(",", ".")));
}
