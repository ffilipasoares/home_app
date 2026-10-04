"""Revolut (via Enable Banking) connect flow and transaction sync.

Where things are stored:
- users/{uid}/accounts/{accountKey}: what the app shows in Settings
  (display name, currency, consent expiry, last sync, status). Readable by
  the signed-in user like the rest of their data.
- bankSecrets/{uid}/accounts/{accountKey}: the Enable Banking session ID
  and account uid needed to read transactions. Top-level collection with
  no security rule, so only Cloud Functions (Admin SDK) can read it.
- bankAuthStates/{state}: one-time `state` values for an in-flight
  consent, checked on the way back so a consent can only be finished by
  the user who started it. Also server-only.

Sync rules (decided by the user, docs/ARCHITECTURE.md §11 Phase 2):
- Only settled (BOOK) transactions are imported; pending ones are skipped
  until a later run sees them booked.
- Revolut EXCHANGE transactions are moves between the EUR and GBP pockets
  of the same joint account: stored with internalTransfer=True and left out
  of every dashboard total.
- Nothing booked before HISTORY_START (1 September 2026) is imported,
  even though Revolut offers ~90 days: the first sync after connecting
  starts there, which keeps the first import (and the burst of
  categorization runs it triggers) small. Later runs re-read only the last
  few days before the most recent booked date; transaction IDs are derived
  from the bank's own entry_reference, so re-reading never creates
  duplicates.

Account holder names (debtor.name on a debit, creditor.name on a credit)
and IBANs are never written to Firestore.
"""

import hashlib
import os
import secrets
import time
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from firebase_admin import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

from enable_banking import ASPSP_NAME, Client, EnableBankingError
from fx import HOME_CURRENCY, rate_to_home_currency
from merchant import normalize_merchant
from schema import Transaction

PROVIDER = "enablebanking"
STATE_TTL_SECONDS = 30 * 60
# Revolut sometimes books a transaction with an earlier booking_date than
# ones already seen; re-reading a few days back catches those.
RESYNC_OVERLAP_DAYS = 5
# Earliest booking date ever imported (YYYY-MM-DD).
HISTORY_START = os.environ.get("BANK_HISTORY_START", "2026-09-01")
_BATCH_LIMIT = 450
_GET_ALL_CHUNK = 300


def _now_ms() -> int:
    return int(time.time() * 1000)


def _hash(value: str, length: int) -> str:
    return hashlib.sha256(value.encode()).hexdigest()[:length]


def account_key(account: dict) -> str:
    """Stable Firestore ID for a bank account. Enable Banking's `uid` is new
    on every session, so it's keyed on identification_hash instead (same
    account -> same hash across reconnects), hashed again because the raw
    value can contain '/' which isn't allowed in a document ID."""
    return _hash(account.get("identification_hash") or account["uid"], 20)


def display_name(account: dict) -> str:
    return f"{ASPSP_NAME} {account.get('currency') or ''}".strip()


def _merchant(raw: dict, debit: bool) -> str:
    # On a debit the counterparty is the creditor (the shop); on a credit
    # it's the debtor (the payer). The other side is the account holder.
    counterparty = (raw.get("creditor") if debit else raw.get("debtor")) or {}
    if counterparty.get("name"):
        return counterparty["name"].strip()
    for line in raw.get("remittance_information") or []:
        if line and line.strip():
            return line.strip()
    return (raw.get("bank_transaction_code") or {}).get("code") or "Unknown"


def transaction_id(acc_key: str, raw: dict) -> str:
    ref = raw.get("entry_reference")
    if not ref:
        # Not seen from Revolut (every transaction had one), but don't
        # crash or collide if it ever happens.
        amt = raw.get("transaction_amount") or {}
        ref = "|".join(
            str(x)
            for x in (
                raw.get("booking_date"),
                amt.get("amount"),
                amt.get("currency"),
                raw.get("credit_debit_indicator"),
                raw.get("remittance_information"),
            )
        )
    return f"eb-{_hash(f'{acc_key}|{ref}', 24)}"


def map_transaction(raw: dict, acc_key: str, now_ms: int) -> Transaction | None:
    """Turns one Enable Banking transaction into this app's Transaction,
    or None if it shouldn't be imported (yet). Pure: no I/O, so it's
    unit-testable against sample data. amountHome is added by the caller."""
    if raw.get("status") != "BOOK":
        return None
    tx_date = raw.get("booking_date") or raw.get("value_date") or raw.get("transaction_date")
    amount_info = raw.get("transaction_amount") or {}
    if not tx_date or amount_info.get("amount") is None or not amount_info.get("currency"):
        return None

    debit = raw.get("credit_debit_indicator") != "CRDT"
    magnitude = abs(Decimal(str(amount_info["amount"])))
    amount = float(-magnitude if debit else magnitude)
    merchant_raw = _merchant(raw, debit)
    internal = (raw.get("bank_transaction_code") or {}).get("code") == "EXCHANGE"

    tx: Transaction = {
        "id": transaction_id(acc_key, raw),
        "date": tx_date,
        "month": tx_date[:7],
        "amount": amount,
        "currency": amount_info["currency"],
        "merchantRaw": merchant_raw,
        "merchantNormalized": normalize_merchant(merchant_raw),
        "category": None,
        # Internal moves skip categorization entirely (main.py only
        # categorizes needsReview transactions without a category).
        "needsReview": not internal,
        "internalTransfer": internal,
        "source": "bank-sync",
        "accountId": acc_key,
        "createdAt": now_ms,
        "updatedAt": now_ms,
    }
    if raw.get("entry_reference"):
        tx["externalId"] = raw["entry_reference"]
    return tx


# --- Connect flow -----------------------------------------------------------


def start_connect(uid: str, client: Client) -> str:
    """Records a one-time state and returns the bank consent URL."""
    db = firestore.client()
    state = secrets.token_urlsafe(24)
    db.collection("bankAuthStates").document(state).set({"uid": uid, "createdAt": _now_ms()})
    # Ask for the longest consent the bank allows, minus a minute so the
    # request is never rejected for being a hair over.
    seconds = max(client.max_consent_seconds() - 60, 3600)
    valid_until = (datetime.now(timezone.utc) + timedelta(seconds=seconds)).isoformat()
    return client.start_auth(state, valid_until)


def _parse_iso_ms(value: str | None) -> int | None:
    if not value:
        return None
    try:
        return int(datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp() * 1000)
    except ValueError:
        return None


def finish_connect(uid: str, code: str, state: str, client: Client) -> dict:
    """Validates the state, creates the session, stores the accounts and
    runs the first sync (everything since HISTORY_START). Returns a small summary for the UI."""
    db = firestore.client()
    state_ref = db.collection("bankAuthStates").document(state)
    state_doc = state_ref.get()
    if not state_doc.exists:
        raise PermissionError("Unknown or already-used connection attempt. Start again from Settings.")
    state_data = state_doc.to_dict() or {}
    state_ref.delete()  # one use only, whatever happens next
    if state_data.get("uid") != uid:
        raise PermissionError("This connection was started by a different user.")
    if _now_ms() - int(state_data.get("createdAt", 0)) > STATE_TTL_SECONDS * 1000:
        raise PermissionError("This connection attempt expired. Start again from Settings.")

    session = client.create_session(code)
    consent_expires_at = _parse_iso_ms((session.get("access") or {}).get("valid_until"))
    user_ref = db.collection("users").document(uid)
    secrets_user_ref = db.collection("bankSecrets").document(uid)
    secrets_user_ref.set({"updatedAt": _now_ms()}, merge=True)

    connected_keys = []
    for account in session.get("accounts", []):
        key = account_key(account)
        connected_keys.append(key)
        secrets_user_ref.collection("accounts").document(key).set(
            {"sessionId": session["session_id"], "accountUid": account["uid"], "updatedAt": _now_ms()}
        )
        user_ref.collection("accounts").document(key).set(
            {
                "provider": PROVIDER,
                "displayName": display_name(account),
                "currency": account.get("currency"),
                "consentExpiresAt": consent_expires_at,
                "status": "active",
                "lastError": None,
                "connectedAt": _now_ms(),
            },
            merge=True,
        )

    # Accounts linked before but not shared this time (unticked on the
    # bank's consent screen) stop syncing.
    for doc in user_ref.collection("accounts").where(filter=FieldFilter("provider", "==", PROVIDER)).stream():
        if doc.id not in connected_keys:
            doc.reference.update({"status": "disconnected"})
            secrets_user_ref.collection("accounts").document(doc.id).delete()

    imported = 0
    for key in connected_keys:
        imported += sync_account(uid, key, client, full_history=True)
    return {"accounts": len(connected_keys), "imported": imported}


# --- Sync ---------------------------------------------------------------------


def _existing_ids(tx_col, ids: list[str]) -> set[str]:
    db = firestore.client()
    found: set[str] = set()
    for start in range(0, len(ids), _GET_ALL_CHUNK):
        refs = [tx_col.document(tx_id) for tx_id in ids[start : start + _GET_ALL_CHUNK]]
        found.update(snap.id for snap in db.get_all(refs) if snap.exists)
    return found


def sync_account(uid: str, key: str, client: Client, full_history: bool = False) -> int:
    """Imports new booked transactions for one account. Returns how many
    were written. Bank errors are recorded on the account doc (and, when
    the consent is gone, status becomes "reconnect-needed") rather than
    raised, so one bad account doesn't stop the others."""
    db = firestore.client()
    user_ref = db.collection("users").document(uid)
    account_ref = user_ref.collection("accounts").document(key)
    secret = db.collection("bankSecrets").document(uid).collection("accounts").document(key).get()
    account = account_ref.get().to_dict() or {}
    if not secret.exists or account.get("status") == "disconnected":
        return 0

    expires_at = account.get("consentExpiresAt")
    if expires_at and expires_at < _now_ms():
        account_ref.update({"status": "reconnect-needed", "lastError": "Bank access expired."})
        return 0

    date_from = HISTORY_START
    if not full_history and account.get("lastBookedDate"):
        start = date.fromisoformat(account["lastBookedDate"]) - timedelta(days=RESYNC_OVERLAP_DAYS)
        date_from = max(start.isoformat(), HISTORY_START)

    now_ms = _now_ms()
    try:
        raws = list(client.iter_transactions(secret.to_dict()["accountUid"], date_from))
    except EnableBankingError as err:
        print(f"sync_account uid={uid} account={key}: {err}")
        update = {"lastError": f"Bank error {err.status}", "lastSyncedAt": now_ms}
        if err.needs_reconnect:
            update["status"] = "reconnect-needed"
        account_ref.update(update)
        return 0

    # Filtered here too, so the cut-off holds even if the bank ignores date_from.
    mapped = [tx for tx in (map_transaction(raw, key, now_ms) for raw in raws) if tx and tx["date"] >= HISTORY_START]
    tx_col = user_ref.collection("transactions")
    existing = _existing_ids(tx_col, [tx["id"] for tx in mapped])
    new = [tx for tx in mapped if tx["id"] not in existing]

    rates: dict[tuple[str, str], float | None] = {}
    for tx in new:
        if tx["currency"] == HOME_CURRENCY:
            continue
        rate_key = (tx["currency"], tx["date"])
        if rate_key not in rates:
            rates[rate_key] = rate_to_home_currency(*rate_key)
        rate = rates[rate_key]
        if rate is not None:
            # Without amountHome the dashboard counts it as needing review
            # instead of mixing an unconverted amount into a EUR total.
            tx["amountHome"] = round(tx["amount"] * rate, 2)

    for i in range(0, len(new), _BATCH_LIMIT):
        batch = db.batch()
        for tx in new[i : i + _BATCH_LIMIT]:
            batch.set(tx_col.document(tx["id"]), tx)
        batch.commit()

    booked_dates = [tx["date"] for tx in mapped]
    last_booked = max([account.get("lastBookedDate") or "", *booked_dates]) or None
    account_ref.update(
        {
            "status": "active",
            "lastError": None,
            "lastSyncedAt": now_ms,
            "lastBookedDate": last_booked,
            "lastImportedCount": len(new),
        }
    )
    return len(new)


def sync_user(uid: str, client: Client) -> int:
    db = firestore.client()
    keys = [doc.id for doc in db.collection("bankSecrets").document(uid).collection("accounts").stream()]
    return sum(sync_account(uid, key, client) for key in keys)


def sync_all_users(client: Client) -> None:
    db = firestore.client()
    for user_doc in db.collection("bankSecrets").stream():
        try:
            imported = sync_user(user_doc.id, client)
            print(f"daily sync uid={user_doc.id}: {imported} new transactions")
        except Exception as err:  # keep going for any other user
            print(f"daily sync failed for uid={user_doc.id}: {err}")
