import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";
import { recomputeMonth } from "./dashboard";
import { categorizeTransaction, CONFIDENCE_THRESHOLD } from "./categorize";
import type { CategoryDef, CategoryRule, Transaction } from "./types";

initializeApp();

/**
 * Categorizes one freshly-imported transaction: a categoryRules cache hit
 * (free, instant) if this merchant has been confirmed before, otherwise a
 * Gemini call. High confidence clears `needsReview` and teaches the cache;
 * low confidence still writes the guess as a pre-filled suggestion but
 * leaves `needsReview` set, so a human confirms it with one tap on
 * Transactions rather than picking from scratch. A failed/unclear call
 * writes nothing — the transaction just stays uncategorized for manual
 * review, same as before this agent existed.
 */
async function autoCategorize(uid: string, txId: string, tx: Transaction): Promise<void> {
  const db = getFirestore();
  const userRef = db.collection("users").doc(uid);
  const txRef = userRef.collection("transactions").doc(txId);

  const ruleSnap = await userRef.collection("categoryRules").doc(tx.merchantNormalized).get();
  if (ruleSnap.exists) {
    const rule = ruleSnap.data() as CategoryRule;
    await txRef.update({ category: rule.category, needsReview: false, source: "auto", confidence: 1, updatedAt: Date.now() });
    return;
  }

  const categoriesSnap = await userRef.collection("settings").doc("categories").get();
  const categories = (categoriesSnap.data()?.categories as CategoryDef[] | undefined) ?? [];
  const result = await categorizeTransaction(tx.merchantRaw, tx.amount, categories);
  if (!result) return;

  const confident = result.confidence >= CONFIDENCE_THRESHOLD;
  await txRef.update({
    category: result.category,
    needsReview: !confident,
    source: "auto",
    confidence: result.confidence,
    updatedAt: Date.now(),
  });

  // Only a confident fresh guess teaches the cache — an unconfirmed
  // suggestion shouldn't get treated as ground truth for the next merchant
  // that looks similar.
  if (confident) {
    await userRef.collection("categoryRules").doc(tx.merchantNormalized).set(
      {
        merchantNormalized: tx.merchantNormalized,
        category: result.category,
        timesConfirmed: FieldValue.increment(1),
        lastUpdated: Date.now(),
      },
      { merge: true },
    );
  }
}

/**
 * Fires on every create/update/delete under users/{uid}/transactions/{txId}.
 * Three responsibilities, all idempotent:
 *  1. Learn a merchant -> category rule when a human confirms one (a
 *     manual-edit).
 *  2. Auto-categorize a freshly-imported transaction that has no category
 *     yet (see autoCategorize) — this writes back to the same document,
 *     which re-triggers this function once more; the second pass sees
 *     `category` already set and skips straight to recompute, so this
 *     always terminates in exactly two invocations, never a loop.
 *  3. Recompute that month's dashboard doc from scratch (see dashboard.ts).
 *
 * A CSV import writing 100 rows fires this 100 times for the same month;
 * each run just re-derives the same totals, so that's wasted work, not
 * wrong output — fine at this project's transaction volume.
 */
export const onTransactionWrite = onDocumentWritten("users/{uid}/transactions/{txId}", async (event) => {
  const uid = event.params.uid;
  const txId = event.params.txId;
  const before = event.data?.before?.data() as Transaction | undefined;
  const after = event.data?.after?.data() as Transaction | undefined;
  const month = after?.month ?? before?.month;

  if (!month) {
    logger.warn("Transaction write with no month on either side", { uid, txId });
    return;
  }

  if (after?.source === "manual-edit" && after.category) {
    await getFirestore()
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
  } else if (after && after.category === null && after.needsReview) {
    await autoCategorize(uid, txId, after);
  }

  await recomputeMonth(uid, month);
  // A transaction can be moved to a different budget month than its date
  // (e.g. a salary paid on the 25th that belongs to next month) — if
  // before.month differs from after.month, recompute the vacated month
  // too so its totals don't go stale.
  if (before?.month && before.month !== month) {
    await recomputeMonth(uid, before.month);
  }
});

/**
 * Fires when a month's income (salary + any partner contribution) is
 * entered/edited from the Dashboard — see app/src/lib/monthlyIncome.ts.
 * The doc id under monthlyIncome/{month} IS the month, so no fallback like
 * onTransactionWrite needs is necessary here.
 */
export const onMonthlyIncomeWrite = onDocumentWritten("users/{uid}/monthlyIncome/{month}", async (event) => {
  await recomputeMonth(event.params.uid, event.params.month);
});
