import {
  collection,
  deleteDoc,
  doc,
  setDoc,
  onSnapshot,
  orderBy,
  query,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import { normalizeMerchant } from "./merchant";
import type { Transaction } from "../types";

const BATCH_LIMIT = 450; // Firestore's hard cap is 500 writes/batch — leave headroom.

function transactionsCol(uid: string) {
  return collection(db, "users", uid, "transactions");
}

/** FNV-1a — good enough to turn "same row imported twice" into "same doc id", not for anything security-sensitive. */
function stableHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export type ImportRow = {
  date: string; // YYYY-MM-DD
  amount: number; // signed: negative = out, positive = in
  merchantRaw: string;
  currency: string;
};

/** Deterministic id from the row's own content, so re-importing the same statement twice is a no-op, not a duplicate. */
export function transactionIdFor(row: ImportRow): string {
  return stableHash(`${row.date}|${row.amount}|${row.merchantRaw}`);
}

export function subscribeMonthTransactions(
  uid: string,
  month: string,
  cb: (transactions: Transaction[]) => void,
) {
  const q = query(transactionsCol(uid), where("month", "==", month), orderBy("date", "desc"));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => d.data() as Transaction)),
    (err) => console.error("subscribeMonthTransactions failed", err),
  );
}

/** Every transaction, newest first: for searching across all months (a household's volume is small). */
export function subscribeAllTransactions(uid: string, cb: (transactions: Transaction[]) => void) {
  return onSnapshot(
    query(transactionsCol(uid), orderBy("date", "desc")),
    (snap) => cb(snap.docs.map((d) => d.data() as Transaction)),
    (err) => console.error("subscribeAllTransactions failed", err),
  );
}

/**
 * Saves an edit from the Transactions page in one write: a new category
 * (treated like any manual edit, so it teaches the merchant cache) and/or
 * a different budget month. One write, so the Cloud Function sees both
 * changes together.
 */
export async function saveTransactionEdit(
  uid: string,
  txId: string,
  changes: { category?: string; month?: string },
): Promise<void> {
  const patch: Record<string, unknown> = { updatedAt: Date.now() };
  if (changes.category !== undefined) {
    Object.assign(patch, { category: changes.category, needsReview: false, source: "manual-edit" });
  }
  if (changes.month !== undefined) patch.month = changes.month;
  await setDoc(doc(transactionsCol(uid), txId), patch, { merge: true });
}

export type ManualTransaction = {
  date: string; // YYYY-MM-DD
  merchantRaw: string;
  amount: number; // signed: negative = money out, positive = money in
  currency: string;
  /** null = let the categorization agent choose. */
  category: string | null;
};

/**
 * Adds a transaction by hand, e.g. something paid from another account. It
 * goes through the same Cloud Function trigger as any other: converted to
 * EUR/GBP, categorized by the agent if no category was picked (a picked
 * one teaches the merchant cache, like an edit), and counted in the
 * dashboard.
 */
export async function addManualTransaction(uid: string, input: ManualTransaction): Promise<string> {
  const ref = doc(transactionsCol(uid));
  const now = Date.now();
  const tx: Transaction = {
    id: ref.id,
    date: input.date,
    month: input.date.slice(0, 7),
    amount: input.amount,
    currency: input.currency,
    merchantRaw: input.merchantRaw,
    merchantNormalized: normalizeMerchant(input.merchantRaw),
    category: input.category,
    needsReview: input.category === null,
    source: input.category === null ? "manual-import" : "manual-edit",
    addedManually: true,
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(ref, tx);
  return tx.month;
}

/** Removes a transaction entirely — the Cloud Function trigger still fires on a delete and recomputes the month it was counted in, so it drops out of every total, not just the visible list. */
export async function deleteTransaction(uid: string, txId: string): Promise<void> {
  await deleteDoc(doc(transactionsCol(uid), txId));
}

/** Bulk-writes imported rows as uncategorized transactions flagged for review. Chunks into multiple batches once past Firestore's per-batch write limit. */
export async function importTransactions(uid: string, rows: ImportRow[]): Promise<number> {
  let written = 0;
  for (let i = 0; i < rows.length; i += BATCH_LIMIT) {
    const chunk = rows.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);
    for (const row of chunk) {
      const id = transactionIdFor(row);
      const tx: Transaction = {
        id,
        date: row.date,
        month: row.date.slice(0, 7),
        amount: row.amount,
        currency: row.currency,
        merchantRaw: row.merchantRaw,
        merchantNormalized: normalizeMerchant(row.merchantRaw),
        category: null,
        needsReview: true,
        source: "manual-import",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      batch.set(doc(transactionsCol(uid), id), tx, { merge: true });
    }
    await batch.commit();
    written += chunk.length;
  }
  return written;
}
