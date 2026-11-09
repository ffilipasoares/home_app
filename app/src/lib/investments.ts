import { collection, doc, limitToLast, onSnapshot, orderBy, query, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase";
import type { InvestmentHistoryPoint, InvestmentSettings, InvestmentsDoc } from "../types";

/** The accounts set up the first time the tab opens (decided by the user). */
export const DEFAULT_INVESTMENT_ACCOUNTS: InvestmentSettings = {
  accounts: [
    { id: "t212-isa", label: "T212 Stocks ISA", kind: "trading212" },
    { id: "t212-cash-isa", label: "T212 Cash ISA", kind: "cash", currency: "GBP", balance: 0 },
    { id: "degiro", label: "Degiro", kind: "holdings", holdings: [] },
    {
      id: "schwab",
      label: "Google (Schwab)",
      kind: "holdings",
      holdings: [{ id: "googl", symbol: "GOOGL", name: "Alphabet Inc. (vested)", quantity: 0 }],
    },
  ],
};

const settingsRef = (uid: string) => doc(db, "users", uid, "settings", "investments");

/** null until the accounts have been set up. */
export function subscribeInvestmentSettings(uid: string, cb: (s: InvestmentSettings | null) => void) {
  return onSnapshot(settingsRef(uid), (snap) => cb(snap.exists() ? (snap.data() as InvestmentSettings) : null));
}

/** Saving values the accounts again straight away (functions/main.py). */
export function saveInvestmentSettings(uid: string, settings: InvestmentSettings): Promise<void> {
  return setDoc(settingsRef(uid), settings);
}

export function subscribeInvestments(uid: string, cb: (d: InvestmentsDoc | null) => void) {
  return onSnapshot(doc(db, "users", uid, "investments", "current"), (snap) =>
    cb(snap.exists() ? (snap.data() as InvestmentsDoc) : null),
  );
}

/** The daily totals, oldest first (about the last two years). */
export function subscribeInvestmentHistory(uid: string, cb: (points: InvestmentHistoryPoint[]) => void) {
  const q = query(collection(db, "users", uid, "investmentHistory"), orderBy("date"), limitToLast(730));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => d.data() as InvestmentHistoryPoint)));
}

export async function connectTrading212(accountId: string, key: string, secret: string): Promise<void> {
  await httpsCallable(functions, "investments_connect")({ accountId, key, secret });
}

export async function disconnectTrading212(accountId: string): Promise<void> {
  await httpsCallable(functions, "investments_disconnect")({ accountId });
}

/** false: refreshed less than a minute ago, nothing done. */
export async function refreshInvestments(): Promise<boolean> {
  const res = await httpsCallable<unknown, { refreshed: boolean }>(functions, "investments_refresh", { timeout: 120_000 })({});
  return res.data.refreshed;
}

export type SymbolMatch = { symbol: string; name: string; exchange: string; type: string; price?: number; currency?: string };

export async function lookupSymbol(queryText: string): Promise<SymbolMatch[]> {
  const res = await httpsCallable<{ query: string }, { results: SymbolMatch[] }>(functions, "investments_lookup")({
    query: queryText,
  });
  return res.data.results;
}
