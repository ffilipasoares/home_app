"""Cloud Functions entry point. Firebase's Python Functions Framework
discovers the functions exported below.

Four responsibilities, split across two triggers, all idempotent:
  1. Learn a merchant -> category rule when a human confirms one (a
     manual-edit).
  2. Auto-categorize a freshly-imported transaction that has no category
     yet (see _auto_categorize; the answer is always applied, and you can
     edit it afterwards) — this writes back to the same document,
     which re-triggers on_transaction_write once more; the second pass
     sees `category` already set and skips straight to recompute, so this
     always terminates in exactly two invocations, never a loop.
  3. The moment a transaction's category is first set (or changes) to the
     "income"-special category, decide whether it belongs to next month
     instead of its calendar month (see budget_month.py) — applied once,
     on that transition, never re-applied on a later write that doesn't
     change the category, so a manual "move to a different month"
     afterward isn't fought by this rule re-asserting itself.
  4. Recompute that month's dashboard doc from scratch on every
     transaction write or income edit (see dashboard.py).

A CSV import writing 100 rows fires (1) 100 times for the same month;
each run just re-derives the same totals, so that's wasted work, not
wrong output — fine at this project's transaction volume.

Bank connection (Revolut via Enable Banking, see bank_sync.py): callable
functions start and finish the consent and run an on-demand sync, and a
scheduled function imports new transactions once a day. Synced
transactions land in the same transactions collection, so the triggers
above categorize them and update the dashboard with no special casing.
"""

import asyncio
import os
import time
import traceback

import firebase_admin
from firebase_admin import firestore
from firebase_functions import firestore_fn, https_fn, scheduler_fn
from firebase_functions.params import SecretParam
from google.cloud.firestore_v1 import DELETE_FIELD, Increment
from google.cloud.firestore_v1.base_query import FieldFilter

import bank_sync
from budget_month import resolve_budget_month
from categorize import CONFIDENCE_THRESHOLD, CategorizationError, categorize_transaction
from category_rules import find_exact_category_rule, list_recent_category_rules
from dashboard import recompute_month
from enable_banking import Client, EnableBankingError
from schema import CategoryDef, Transaction

firebase_admin.initialize_app()

# The Enable Banking application's private key, stored in Secret Manager
# (`firebase functions:secrets:set ENABLE_BANKING_PRIVATE_KEY`, see
# SETUP.md). Only the functions that list it in `secrets=` can read it.
ENABLE_BANKING_PRIVATE_KEY = SecretParam("ENABLE_BANKING_PRIVATE_KEY")
# Same single allow-listed account as firestore.rules and the app's
# VITE_ALLOWED_EMAIL. Security rules don't cover callable functions, so
# the check is repeated here.
ALLOWED_EMAIL = os.environ.get("ALLOWED_EMAIL", "filipaferreirasoares12@gmail.com")


def _load_categories(uid: str) -> list[CategoryDef]:
    snap = firestore.client().collection("users").document(uid).collection("settings").document("categories").get()
    return (snap.to_dict() or {}).get("categories", [])


def _special_for(categories: list[CategoryDef], category_id: str) -> str | None:
    return next((c.get("special") for c in categories if c["id"] == category_id), None)


async def _auto_categorize(uid: str, tx_id: str, tx: Transaction) -> bool:
    """Categorizes one uncategorized transaction and saves the result.
    Returns True on success.

    An exact-match cache hit (free, instant, deterministic) short-circuits
    before the agent is ever invoked. Otherwise the categorization agent
    (categorize.py) decides, and its answer is always applied: the
    transaction counts in the dashboard straight away and can be edited on
    the Transactions page. Only a confident answer teaches the cache, so an
    unsure guess is never reused as if it were confirmed. If the agent
    fails, the reason is saved as `aiError` (shown in the app, and it stops
    the trigger from retrying in a loop); the nightly job retries it.
    """
    db = firestore.client()
    tx_ref = db.collection("users").document(uid).collection("transactions").document(tx_id)
    now_ms = int(time.time() * 1000)
    categories = _load_categories(uid)

    exact_rule = find_exact_category_rule(uid, tx["merchantNormalized"])
    if exact_rule:
        month = resolve_budget_month(tx["date"], tx["month"], _special_for(categories, exact_rule["category"]))
        tx_ref.update(
            {
                "category": exact_rule["category"],
                "needsReview": False,
                "source": "auto",
                "confidence": 1,
                "month": month,
                "aiError": DELETE_FIELD,
                "updatedAt": now_ms,
            }
        )
        return True

    recent_rules = list_recent_category_rules(uid)
    try:
        result = await categorize_transaction(tx["merchantRaw"], tx["amount"], categories, recent_rules)
    except CategorizationError as err:
        tx_ref.update({"aiError": str(err), "updatedAt": now_ms})
        return False

    month = resolve_budget_month(tx["date"], tx["month"], _special_for(categories, result["category"]))
    tx_ref.update(
        {
            "category": result["category"],
            "needsReview": False,
            "source": "auto",
            "confidence": result["confidence"],
            "month": month,
            "aiError": DELETE_FIELD,
            "updatedAt": now_ms,
        }
    )

    if result["confidence"] >= CONFIDENCE_THRESHOLD:
        db.collection("users").document(uid).collection("categoryRules").document(tx["merchantNormalized"]).set(
            {
                "merchantNormalized": tx["merchantNormalized"],
                "category": result["category"],
                "timesConfirmed": Increment(1),
                "lastUpdated": now_ms,
            },
            merge=True,
        )
    return True


def _categorize_safely(uid: str, tx_id: str, tx: Transaction) -> bool:
    """Runs _auto_categorize and turns *any* unexpected failure (not just a
    model failure) into an `aiError` on the transaction, so it shows in the
    app and the nightly job retries it, instead of crashing the
    trigger or stopping the whole retry run on the first bad transaction."""
    try:
        return asyncio.run(_auto_categorize(uid, tx_id, tx))
    except Exception as err:  # noqa: BLE001 - recorded on the transaction
        traceback.print_exc()
        message = f"{type(err).__name__}: {err}"[:300]
        try:
            firestore.client().collection("users").document(uid).collection("transactions").document(tx_id).update(
                {"aiError": message, "updatedAt": int(time.time() * 1000)}
            )
        except Exception:  # noqa: BLE001 - e.g. the transaction was deleted meanwhile
            traceback.print_exc()
        return False


def _awaiting_auto_category(tx: dict) -> bool:
    return (
        tx.get("category") is None
        and bool(tx.get("needsReview"))
        and not tx.get("internalTransfer")
        # A failed attempt records aiError on this same document, which
        # fires the trigger again; don't retry in a loop (the nightly job
        # retries it).
        and not tx.get("aiError")
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

    category_changed = after is not None and (before or {}).get("category") != after.get("category")

    if after and after.get("source") == "manual-edit" and after.get("category"):
        if category_changed:
            categories = _load_categories(uid)
            new_month = resolve_budget_month(after["date"], after["month"], _special_for(categories, after["category"]))
            if new_month != after["month"]:
                firestore.client().collection("users").document(uid).collection("transactions").document(tx_id).update(
                    {"month": new_month}
                )
                month = new_month  # so this invocation's own recompute below already uses it

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
    elif after and _awaiting_auto_category(after):
        # asyncio.run() is safe here: Cloud Functions dispatches this
        # (synchronous) handler outside any existing event loop, so this
        # always starts a fresh one rather than conflicting with one.
        _categorize_safely(uid, tx_id, after)

    recompute_month(uid, month)
    # A transaction can be moved to a different budget month than its date
    # (e.g. a salary paid on the 25th that belongs to next month) — if
    # before.month differs from the month we ended up using, recompute the
    # vacated month too so its totals don't go stale.
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


# --- Catching up on anything still uncategorized -----------------------------

# Leaves room under the 540 s timeout to save the last answer.
_RUN_BUDGET_SECONDS = 480
# A transaction this fresh is most likely still being categorized by its
# own trigger; leave it alone so the two don't both call the model.
_RETRY_MIN_AGE_MS = 10 * 60 * 1000


def _user_ids() -> list[str]:
    """Every user with data. list_documents() also returns users/{uid}
    entries that only exist as a parent of subcollections (no profile
    document of their own), which stream() silently skips."""
    return [ref.id for ref in firestore.client().collection("users").list_documents()]


def _categorize_pending(uid: str, deadline: float, min_age_ms: int = _RETRY_MIN_AGE_MS) -> dict:
    """Categorizes every transaction still waiting for a category, newest
    first, one at a time, until `deadline` (time.monotonic()). Skips ones
    updated less than `min_age_ms` ago that haven't failed (their own
    trigger is on them). Older AI suggestions held for confirmation under
    the previous rules are accepted as they are. Used by the nightly job
    and by scripts/categorize_backlog.py."""
    db = firestore.client()
    tx_col = db.collection("users").document(uid).collection("transactions")
    pending = list(tx_col.where(filter=FieldFilter("needsReview", "==", True)).stream())
    pending.sort(key=lambda doc: (doc.to_dict() or {}).get("date", ""), reverse=True)
    print(f"_categorize_pending uid={uid}: {len(pending)} transaction(s) with needsReview")

    now_ms = int(time.time() * 1000)
    done = failed = 0
    last_error = None
    for i, doc in enumerate(pending):
        if time.monotonic() > deadline:
            return {"done": done, "failed": failed, "remaining": len(pending) - i, "lastError": last_error}
        tx = doc.to_dict() or {}
        if tx.get("internalTransfer"):
            continue
        if tx.get("category"):
            doc.reference.update({"needsReview": False, "updatedAt": now_ms})
            done += 1
            continue
        if not tx.get("aiError") and now_ms - int(tx.get("updatedAt") or 0) < min_age_ms:
            continue
        started = time.monotonic()
        if _categorize_safely(uid, doc.id, tx):
            done += 1
            print(f"  categorized {doc.id} in {time.monotonic() - started:.1f}s")
        else:
            failed += 1
            last_error = (doc.reference.get().to_dict() or {}).get("aiError")
    return {"done": done, "failed": failed, "remaining": 0, "lastError": last_error}


# --- Bank connection ----------------------------------------------------------


def _require_owner(req: https_fn.CallableRequest) -> str:
    if req.auth is None:
        raise https_fn.HttpsError(https_fn.FunctionsErrorCode.UNAUTHENTICATED, "Sign in first.")
    if req.auth.token.get("email") != ALLOWED_EMAIL:
        raise https_fn.HttpsError(https_fn.FunctionsErrorCode.PERMISSION_DENIED, "Not allowed.")
    return req.auth.uid


def _bank_client() -> Client:
    return Client(ENABLE_BANKING_PRIVATE_KEY.value)


def _bank_error(err: EnableBankingError) -> https_fn.HttpsError:
    print(f"Enable Banking call failed: {err}")
    return https_fn.HttpsError(https_fn.FunctionsErrorCode.UNAVAILABLE, f"The bank connection service returned an error ({err.status}).")


@https_fn.on_call(secrets=[ENABLE_BANKING_PRIVATE_KEY])
def bank_connect_start(req: https_fn.CallableRequest) -> dict:
    """Returns the Revolut consent URL for the app to redirect to."""
    uid = _require_owner(req)
    try:
        return {"url": bank_sync.start_connect(uid, _bank_client())}
    except EnableBankingError as err:
        raise _bank_error(err) from err


# The first sync imports everything since 1 September (and converts GBP amounts),
# which can take a while, hence the longer timeout. The app's callable
# timeout is raised to match (app/src/lib/bank.ts).
@https_fn.on_call(secrets=[ENABLE_BANKING_PRIVATE_KEY], timeout_sec=540)
def bank_connect_finish(req: https_fn.CallableRequest) -> dict:
    """Called by the app's /bank-callback page with the bank's ?code and
    ?state. Creates the session, stores the accounts and imports history."""
    uid = _require_owner(req)
    code = (req.data or {}).get("code")
    state = (req.data or {}).get("state")
    if not code or not state:
        raise https_fn.HttpsError(https_fn.FunctionsErrorCode.INVALID_ARGUMENT, "Missing code or state.")
    try:
        return bank_sync.finish_connect(uid, code, state, _bank_client())
    except PermissionError as err:
        raise https_fn.HttpsError(https_fn.FunctionsErrorCode.PERMISSION_DENIED, str(err)) from err
    except EnableBankingError as err:
        raise _bank_error(err) from err


@https_fn.on_call(secrets=[ENABLE_BANKING_PRIVATE_KEY], timeout_sec=540)
def bank_sync_now(req: https_fn.CallableRequest) -> dict:
    """The Settings page's "Sync now" button: same as the daily run, for
    the signed-in user only."""
    uid = _require_owner(req)
    return {"imported": bank_sync.sync_user(uid, _bank_client())}


# Once a day, late evening Lisbon time, so the day's card payments have
# had time to settle. Pending transactions are skipped and picked up by a
# later run once booked.
@scheduler_fn.on_schedule(
    schedule="0 23 * * *",
    timezone=scheduler_fn.Timezone("Europe/Lisbon"),
    secrets=[ENABLE_BANKING_PRIVATE_KEY],
    timeout_sec=540,
)
def daily_bank_sync(event: scheduler_fn.ScheduledEvent) -> None:
    deadline = time.monotonic() + _RUN_BUDGET_SECONDS
    bank_sync.sync_all_users(_bank_client())
    # Safety net, no separate scheduler: anything whose own categorization
    # failed earlier (and isn't brand new from this sync, which its trigger
    # is handling right now) gets another go, one at a time.
    for uid in _user_ids():
        print(f"daily_bank_sync catch-up uid={uid}: {_categorize_pending(uid, deadline)}")
