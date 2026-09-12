import {
  collection,
  doc,
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
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => d.data() as Transaction));
  });
}

/** Manual category edit from the Transactions screen — the Cloud Function trigger picks this up to learn the merchant rule and recompute the month's dashboard. */
export async function updateTransactionCategory(
  uid: string,
  txId: string,
  category: string,
  needed: boolean,
): Promise<void> {
  const batch = writeBatch(db);
  batch.set(
    doc(transactionsCol(uid), txId),
    {
      category,
      needed,
      needsReview: false,
      source: "manual-edit",
      updatedAt: Date.now(),
    },
    { merge: true },
  );
  await batch.commit();
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
        needed: null,
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
