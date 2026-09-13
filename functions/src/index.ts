import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";
import { recomputeMonth } from "./dashboard";
import type { Transaction } from "./types";

initializeApp();

/**
 * Fires on every create/update/delete under users/{uid}/transactions/{txId}.
 * Two responsibilities, both idempotent:
 *  1. Learn a merchant -> category rule when a human confirms one (a
 *     manual-edit) — the Phase 1 categorization agent reads this cache
 *     before ever calling Gemini.
 *  2. Recompute that month's dashboard doc from scratch (see dashboard.ts).
 *
 * A CSV import writing 100 rows fires this 100 times for the same month;
 * each run just re-derives the same totals, so that's wasted work, not
 * wrong output — fine at this project's transaction volume.
 */
export const onTransactionWrite = onDocumentWritten("users/{uid}/transactions/{txId}", async (event) => {
  const uid = event.params.uid;
  const before = event.data?.before?.data() as Transaction | undefined;
  const after = event.data?.after?.data() as Transaction | undefined;
  const month = after?.month ?? before?.month;

  if (!month) {
    logger.warn("Transaction write with no month on either side", { uid, txId: event.params.txId });
    return;
  }

  if (after?.source === "manual-edit" && after.category) {
    const db = getFirestore();
    await db
      .collection("users")
      .doc(uid)
      .collection("categoryRules")
      .doc(after.merchantNormalized)
      .set(
        {
          merchantNormalized: after.merchantNormalized,
          category: after.category,
          timesConfirmed: FieldValue.increment(1),
          lastUpdated: Date.now(),
        },
        { merge: true },
      );
  }

  await recomputeMonth(uid, month);
  // A category edit can move a transaction's date in theory (it can't
  // today), but if before.month ever differs from after.month, recompute
  // the vacated month too so its totals don't go stale.
  if (before?.month && before.month !== month) {
    await recomputeMonth(uid, before.month);
  }
});
