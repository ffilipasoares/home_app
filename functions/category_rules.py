"""Merchant -> category learned-rule cache: read by the categorization
agent, written whenever a category is confirmed (a confident agent guess,
or a human edit).
"""

from firebase_admin import firestore

from schema import CategoryRule


def _rules_collection(uid: str):
    return firestore.client().collection("users").document(uid).collection("categoryRules")


def find_exact_category_rule(uid: str, merchant_normalized: str) -> CategoryRule | None:
    """Exact-match lookup, checked before ever invoking the agent — a
    confirmed merchant costs nothing and takes no model call."""
    snap = _rules_collection(uid).document(merchant_normalized).get()
    return snap.to_dict() if snap.exists else None  # type: ignore[return-value]


def list_recent_category_rules(uid: str, limit: int = 200) -> list[CategoryRule]:
    """The most recently confirmed merchant->category pairs, for the
    categorization agent's own judgment on a merchant with no exact match
    — e.g. "UBER EATS" has no rule yet, but "UBER" -> Transport does, and
    the model can reason about that similarity in a way a rigid exact-
    match lookup can't. Capped rather than the full history, to bound
    prompt size as the cache grows over years of use.
    """
    docs = _rules_collection(uid).order_by("lastUpdated", direction=firestore.Query.DESCENDING).limit(limit).stream()
    return [d.to_dict() for d in docs]  # type: ignore[misc]
