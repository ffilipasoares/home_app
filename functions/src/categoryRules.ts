import { getFirestore } from "firebase-admin/firestore";
import type { CategoryRule } from "./types";

/** Exact-match lookup, checked before ever invoking the agent — a confirmed merchant costs nothing and takes no model call. */
export async function findExactCategoryRule(uid: string, merchantNormalized: string): Promise<CategoryRule | null> {
  const snap = await getFirestore()
    .collection("users")
    .doc(uid)
    .collection("categoryRules")
    .doc(merchantNormalized)
    .get();
  return snap.exists ? (snap.data() as CategoryRule) : null;
}

/**
 * The most recently confirmed merchant->category pairs, for the
 * categorization agent's own judgment on a merchant with no exact match —
 * e.g. "UBER EATS" has no rule yet, but "UBER" -> Transport does, and the
 * model can reason about that similarity in a way a rigid exact-match
 * lookup can't. Capped rather than the full history, to bound prompt size
 * as the cache grows over years of use.
 */
export async function listRecentCategoryRules(uid: string, limit = 200): Promise<CategoryRule[]> {
  const snap = await getFirestore()
    .collection("users")
    .doc(uid)
    .collection("categoryRules")
    .orderBy("lastUpdated", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => d.data() as CategoryRule);
}
