"""Merchant -> category learned-rule cache: read by the categorization
agent, written whenever a category is confirmed (a confident agent guess,
or a human edit).
"""

from firebase_admin import firestore

from schema import CategoryRule


def _rules_collection(uid: str):
    return firestore.client().collection("users").document(uid).collection("categoryRules")


# Normalized names that say how money moved, not who it went to: one rule
# for "MBWAY" would file every future MB WAY payment, whatever it was for,
# under the same category. These never become rules and never match one,
# so each such transaction goes to the agent with its amount instead.
GENERIC_NAMES = frozenset(
    {
        "UNKNOWN",
        "MBWAY",
        "MB WAY",
        "TRANSFER",
        "TRANSFERENCIA",
        "BANK TRANSFER",
        "PAYMENT",
        "CARD PAYMENT",
        "PAGAMENTO",
        "PAYPAL",
        "REVOLUT",
        "TOP UP",
        "TO",
        "FROM",
    }
)


def is_rule_key(merchant_normalized: str) -> bool:
    """Whether a normalized merchant can key a learned rule: not empty (an
    empty Firestore document id is an error), not a generic name."""
    return bool(merchant_normalized) and merchant_normalized not in GENERIC_NAMES


def find_exact_category_rule(uid: str, merchant_normalized: str) -> CategoryRule | None:
    """Exact-match lookup, checked before ever invoking the agent — a
    confirmed merchant costs nothing and takes no model call."""
    if not is_rule_key(merchant_normalized):
        return None
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
