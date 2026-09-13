"""Cloud Functions entry point. Firebase's Python Functions Framework
discovers the functions exported below.

Three responsibilities, split across two triggers, all idempotent:
  1. Learn a merchant -> category rule when a human confirms one (a
     manual-edit).
  2. Auto-categorize a freshly-imported transaction that has no category
     yet (see _auto_categorize) — this writes back to the same document,
     which re-triggers on_transaction_write once more; the second pass
     sees `category` already set and skips straight to recompute, so this
     always terminates in exactly two invocations, never a loop.
  3. Recompute that month's dashboard doc from scratch on every
     transaction write or income edit (see dashboard.py).

A CSV import writing 100 rows fires (1) 100 times for the same month;
each run just re-derives the same totals, so that's wasted work, not
wrong output — fine at this project's transaction volume.
"""

import asyncio
import time

import firebase_admin
from firebase_admin import firestore
from firebase_functions import firestore_fn
from google.cloud.firestore_v1 import Increment

from categorize import CONFIDENCE_THRESHOLD, categorize_transaction
from category_rules import find_exact_category_rule, list_recent_category_rules
from dashboard import recompute_month
from schema import CategoryDef, Transaction

firebase_admin.initialize_app()


async def _auto_categorize(uid: str, tx_id: str, tx: Transaction) -> None:
    """Categorizes one freshly-imported transaction. An exact-match cache
    hit (free, instant, purely deterministic — nothing to reason about)
    short-circuits before the agent is ever invoked. Only a genuine cache
    miss reaches the categorization agent (categorize.py) — high
    confidence clears `needsReview` and teaches the cache; low confidence
    still writes the guess as a pre-filled suggestion but leaves
    `needsReview` set, so a human confirms it with one tap on Transactions
    rather than picking from scratch. A failed/unclear run writes nothing
    — the transaction just stays uncategorized for manual review.
    """
    db = firestore.client()
    tx_ref = db.collection("users").document(uid).collection("transactions").document(tx_id)
    now_ms = int(time.time() * 1000)

    exact_rule = find_exact_category_rule(uid, tx["merchantNormalized"])
    if exact_rule:
        tx_ref.update(
            {"category": exact_rule["category"], "needsReview": False, "source": "auto", "confidence": 1, "updatedAt": now_ms}
        )
        return

    categories_snap = db.collection("users").document(uid).collection("settings").document("categories").get()
    categories: list[CategoryDef] = (categories_snap.to_dict() or {}).get("categories", [])
    recent_rules = list_recent_category_rules(uid)

    result = await categorize_transaction(tx["merchantRaw"], tx["amount"], categories, recent_rules)
    if result is None:
        return

    confident = result["confidence"] >= CONFIDENCE_THRESHOLD
    tx_ref.update(
        {
            "category": result["category"],
            "needsReview": not confident,
            "source": "auto",
            "confidence": result["confidence"],
            "updatedAt": now_ms,
        }
    )

    # Only a confident fresh guess teaches the cache — an unconfirmed
    # suggestion shouldn't get treated as ground truth for the next
    # merchant that looks similar.
    if confident:
        db.collection("users").document(uid).collection("categoryRules").document(tx["merchantNormalized"]).set(
            {
                "merchantNormalized": tx["merchantNormalized"],
                "category": result["category"],
                "timesConfirmed": Increment(1),
                "lastUpdated": now_ms,
            },
            merge=True,
        )


@firestore_fn.on_document_written(document="users/{uid}/transactions/{txId}")
def on_transaction_write(event: firestore_fn.Event[firestore_fn.Change]) -> None:
    uid = event.params["uid"]
    tx_id = event.params["txId"]
    before = event.data.before.to_dict() if event.data.before else None
    after = event.data.after.to_dict() if event.data.after else None
    month = (after or {}).get("month") or (before or {}).get("month")

    if not month:
        print(f"Transaction write with no month on either side: uid={uid} txId={tx_id}")
        return

    if after and after.get("source") == "manual-edit" and after.get("category"):
        firestore.client().collection("users").document(uid).collection("categoryRules").document(
            after["merchantNormalized"]
        ).set(
            {
                "merchantNormalized": after["merchantNormalized"],
                "category": after["category"],
                "timesConfirmed": Increment(1),
                "lastUpdated": int(time.time() * 1000),
            },
            merge=True,
        )
    elif after and after.get("category") is None and after.get("needsReview"):
        # asyncio.run() is safe here: Cloud Functions dispatches this
        # (synchronous) handler outside any existing event loop, so this
        # always starts a fresh one rather than conflicting with one.
        asyncio.run(_auto_categorize(uid, tx_id, after))

    recompute_month(uid, month)
    # A transaction can be moved to a different budget month than its date
    # (e.g. a salary paid on the 25th that belongs to next month) — if
    # before.month differs from after.month, recompute the vacated month
    # too so its totals don't go stale.
    before_month = (before or {}).get("month")
    if before_month and before_month != month:
        recompute_month(uid, before_month)


@firestore_fn.on_document_written(document="users/{uid}/monthlyIncome/{month}")
def on_monthly_income_write(event: firestore_fn.Event[firestore_fn.Change]) -> None:
    """Fires when a month's income (salary + any partner contribution) is
    entered/edited from the Dashboard — see app/src/lib/monthlyIncome.ts.
    The doc id under monthlyIncome/{month} IS the month, so no fallback
    like on_transaction_write needs is necessary here.
    """
    recompute_month(event.params["uid"], event.params["month"])
