#!/usr/bin/env python3
"""Offline test of functions/bank_sync.py: the connect flow (state checks,
account and secret storage) and the sync (booked-only, internal
transfers, GBP conversion, pending payments (imported, then settled in
place, replaced under a new reference, or removed when cancelled), no
duplicates on re-sync, error handling,
reconnect) against an in-memory Firestore stand-in and a fake Enable
Banking client with Revolut-shaped transactions. No network, no
credentials.

Run:
    cd functions && source venv/bin/activate && cd ..
    python3 scripts/test_bank_sync.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "functions"))

import bank_sync  # noqa: E402
from enable_banking import EnableBankingError  # noqa: E402


# --- Minimal in-memory Firestore -------------------------------------------
class Snap:
    def __init__(self, ref, data):
        self.reference, self.id, self._data = ref, ref.id, data

    @property
    def exists(self):
        return self._data is not None

    def to_dict(self):
        return None if self._data is None else dict(self._data)


class DocRef:
    def __init__(self, db, path):
        self.db, self.path, self.id = db, path, path.split("/")[-1]

    def collection(self, name):
        return ColRef(self.db, f"{self.path}/{name}")

    def get(self):
        return Snap(self, self.db.store.get(self.path))

    def set(self, data, merge=False):
        self.db.store[self.path] = {**(self.db.store.get(self.path) or {}), **data} if merge else dict(data)

    def update(self, data):
        assert self.path in self.db.store, f"update on missing doc {self.path}"
        self.db.store[self.path].update(data)

    def delete(self):
        self.db.store.pop(self.path, None)


class ColRef:
    def __init__(self, db, path, filters=()):
        self.db, self.path, self.filters = db, path, filters

    def document(self, doc_id):
        return DocRef(self.db, f"{self.path}/{doc_id}")

    def where(self, filter):
        return ColRef(self.db, self.path, (*self.filters, filter))

    def stream(self):
        depth = self.path.count("/") + 1
        for path, data in sorted(self.db.store.items()):
            if path.startswith(self.path + "/") and path.count("/") == depth:
                if all(data.get(f.field_path) == f.value for f in self.filters):
                    yield Snap(DocRef(self.db, path), data)


class Batch:
    def __init__(self, db):
        self.ops = []

    def set(self, ref, data):
        self.ops.append(("set", ref, data))

    def update(self, ref, data):
        self.ops.append(("update", ref, data))

    def delete(self, ref):
        self.ops.append(("delete", ref, None))

    def commit(self):
        for op, ref, data in self.ops:
            if op == "set":
                ref.set(data)
            elif op == "update":
                ref.update(data)
            else:
                ref.delete()


class FakeDB:
    def __init__(self):
        self.store = {}

    def collection(self, name):
        return ColRef(self, name)

    def get_all(self, refs):
        return [ref.get() for ref in refs]

    def batch(self):
        return Batch(self)


db = FakeDB()
bank_sync.firestore.client = lambda: db
import fx  # noqa: E402

# 1 GBP = 1.17 EUR; the inverse for EUR -> GBP.
fx.get_rate = lambda base, quote, d: 1.0 if base == quote else (1.17 if (base, quote) == ("GBP", "EUR") else 1 / 1.17)


# --- Revolut-shaped transactions -------------------------------------------
def tx(ref, d, cur, amt, cdi, code, status="BOOK", creditor=None, debtor=None, remit=None):
    return {
        "entry_reference": ref, "booking_date": d, "value_date": d, "status": status,
        "transaction_amount": {"currency": cur, "amount": amt}, "credit_debit_indicator": cdi,
        "bank_transaction_code": {"code": code, "sub_code": None, "description": None},
        "creditor": {"name": creditor} if creditor else None, "debtor": {"name": debtor} if debtor else None,
        "remittance_information": [remit] if remit else [],
    }


HOLDERS = "FILIPA SOARES & JOAO EXAMPLE"
EUR_TXS = [
    tx("e1", "2026-09-28", "EUR", "12.50", "DBIT", "CARD_PAYMENT", creditor="Pingo Doce Alvalade", debtor=HOLDERS, remit="Pingo Doce"),
    tx("e2", "2026-09-26", "EUR", "2450.00", "CRDT", "TRANSFER", debtor="ACME PORTUGAL LDA", creditor=HOLDERS, remit="Vencimento"),
    tx("e3", "2026-09-20", "EUR", "200.00", "CRDT", "EXCHANGE", remit="Exchanged to EUR"),
    tx("e4", "2026-09-29", "EUR", "5.00", "DBIT", "CARD_PAYMENT", status="PDNG", creditor="Cafe"),
    tx("e5", "2026-09-05", "EUR", "40.00", "DBIT", "TRANSFER", remit="To savings"),
    tx("e6", "2026-08-31", "EUR", "15.00", "DBIT", "CARD_PAYMENT", creditor="Before the cut-off"),
]
GBP_TXS = [
    tx("g1", "2026-10-03", "GBP", "6.85", "DBIT", "CARD_PAYMENT", creditor="Pret A Manger", debtor=HOLDERS),
    tx("g2", "2026-09-20", "GBP", "172.40", "DBIT", "EXCHANGE", remit="Exchanged to EUR"),
    tx("g3", "2026-10-04", "GBP", "9.99", "DBIT", "CARD_PAYMENT", status="PDNG", creditor="Tesco"),
]


class FakeClient:
    def __init__(self):
        self.calls = []
        self.fail = None

    def create_session(self, code):
        assert code == "the-code"
        return {
            "session_id": "sess-1",
            "access": {"valid_until": "2027-01-02T10:00:00.000000Z"},
            "accounts": [
                {"uid": "uid-eur", "currency": "EUR", "identification_hash": "hash/eur+="},
                {"uid": "uid-gbp", "currency": "GBP", "identification_hash": "hash/gbp+="},
            ],
        }

    def iter_transactions(self, account_uid, date_from=None):
        self.calls.append((account_uid, date_from))
        if self.fail:
            raise self.fail
        return iter(EUR_TXS if account_uid == "uid-eur" else GBP_TXS)


client = FakeClient()
UID = "user-1"


def txs():
    return {p.split("/")[-1]: d for p, d in db.store.items() if p.startswith(f"users/{UID}/transactions/")}


def check(label, cond):
    print(("PASS " if cond else "FAIL ") + label)
    if not cond:
        global failed
        failed = True


failed = False

# 1. State checks
db.store["bankAuthStates/s1"] = {"uid": "someone-else", "createdAt": bank_sync._now_ms()}
try:
    bank_sync.finish_connect(UID, "the-code", "s1", client)
    check("rejects a state started by another user", False)
except PermissionError:
    check("rejects a state started by another user", "bankAuthStates/s1" not in db.store)
try:
    bank_sync.finish_connect(UID, "the-code", "nope", client)
    check("rejects an unknown state", False)
except PermissionError:
    check("rejects an unknown state", True)
db.store["bankAuthStates/old"] = {"uid": UID, "createdAt": bank_sync._now_ms() - 31 * 60 * 1000}
try:
    bank_sync.finish_connect(UID, "the-code", "old", client)
    check("rejects an expired state", False)
except PermissionError:
    check("rejects an expired state", True)

# 2. Connect + first sync
db.store["bankAuthStates/good"] = {"uid": UID, "createdAt": bank_sync._now_ms()}
result = bank_sync.finish_connect(UID, "the-code", "good", client)
check(f"summary {result}", result == {"accounts": 2, "imported": 8})
check("state is single-use", "bankAuthStates/good" not in db.store)
check("first sync starts at 1 September", client.calls == [("uid-eur", "2026-09-01"), ("uid-gbp", "2026-09-01")])
check("nothing before 1 September imported, even if the bank returns it", "e6" not in {d.get("externalId") for d in txs().values()})

accounts = {p: d for p, d in db.store.items() if p.startswith(f"users/{UID}/accounts/")}
check("two account docs", len(accounts) == 2)
check("account ids contain no '/'", all("/" not in p.split("/")[-1] for p in accounts))
check("display names", sorted(a["displayName"] for a in accounts.values()) == ["Revolut EUR", "Revolut GBP"])
check("consent expiry stored", all(a["consentExpiresAt"] == 1798884000000 for a in accounts.values()))
check("session id only in bankSecrets", not any("sess-1" in str(d) for p, d in db.store.items() if p.startswith("users/")))
check("bankSecrets parent doc exists (needed by the daily job)", f"bankSecrets/{UID}" in db.store)

t = txs()
by_ref = {d["externalId"]: d for d in t.values()}
check("pending payments imported and marked", by_ref["e4"]["pending"] and by_ref["g3"]["pending"])
check("settled payments not marked pending", by_ref["e1"]["pending"] is False)
check("debit is negative", by_ref["e1"]["amount"] == -12.5)
check("credit is positive", by_ref["e2"]["amount"] == 2450.0)
check("merchant from creditor on debit", by_ref["e1"]["merchantRaw"] == "Pingo Doce Alvalade")
check("merchant from debtor on credit", by_ref["e2"]["merchantRaw"] == "ACME PORTUGAL LDA")
check("merchant falls back to remittance", by_ref["e5"]["merchantRaw"] == "To savings")
check("holder names never stored", HOLDERS not in str(t))
check("EXCHANGE marked internal, not reviewed", by_ref["e3"]["internalTransfer"] and not by_ref["e3"]["needsReview"])
check("GBP EXCHANGE marked internal", by_ref["g2"]["internalTransfer"])
check("normal tx needs categorizing", by_ref["e1"]["needsReview"] and by_ref["e1"]["category"] is None)
check("GBP transaction: exact GBP, EUR converted unrounded", by_ref["g1"]["amountIn"] == {"GBP": -6.85, "EUR": -6.85 * 1.17})
check("EUR transaction: exact EUR, GBP converted unrounded", by_ref["e1"]["amountIn"] == {"EUR": -12.5, "GBP": -12.5 / 1.17})
check("month from date", by_ref["g1"]["month"] == "2026-10")
check("merchantNormalized", by_ref["e1"]["merchantNormalized"] == "PINGO DOCE ALVALADE")
eur_acc = next(a for a in accounts.values() if a["currency"] == "EUR")
check("lastBookedDate ignores pending", eur_acc["lastBookedDate"] == "2026-09-28")

# 3. Re-sync: pending payments settle, change, get replaced or cancelled
def doc_for(ref):
    return next((d for d in txs().values() if d.get("externalId") == ref), None)

first_id = next(i for i, d in t.items() if d["externalId"] == "e1")
db.store[f"users/{UID}/transactions/{first_id}"]["category"] = "food"
g3_id = next(i for i, d in t.items() if d["externalId"] == "g3")
db.store[f"users/{UID}/transactions/{g3_id}"]["category"] = "groceries"  # categorized while pending
client.calls.clear()
GBP_TXS[2]["status"] = "BOOK"  # the pending Tesco payment settled...
GBP_TXS[2]["transaction_amount"]["amount"] = "10.49"  # ...for a slightly different amount
EUR_TXS.remove(next(x for x in EUR_TXS if x["entry_reference"] == "e4"))  # the pending café payment was cancelled
EUR_TXS.append(tx("e7", "2026-09-30", "EUR", "20.00", "DBIT", "CARD_PAYMENT", status="PDNG", creditor="Cinema"))
n = bank_sync.sync_user(UID, client)
check(f"re-sync imports only the new pending one ({n})", n == 1 and doc_for("e7")["pending"])
check("re-sync uses date_from overlap", sorted(client.calls) == [("uid-eur", "2026-09-23"), ("uid-gbp", "2026-09-28")])
check("user's category edit kept", db.store[f"users/{UID}/transactions/{first_id}"]["category"] == "food")
g3 = db.store[f"users/{UID}/transactions/{g3_id}"]
check("settled payment updated in place: not pending, final amount", g3["pending"] is False and g3["amount"] == -10.49)
check("settled payment keeps its category", g3["category"] == "groceries")
check("settled payment's converted amount updated", abs(g3["amountIn"]["EUR"] - (-10.49 * 1.17)) < 1e-9)
check("cancelled pending payment removed", doc_for("e4") is None)

# The pending cinema payment settles under a new reference.
EUR_TXS.remove(next(x for x in EUR_TXS if x["entry_reference"] == "e7"))
EUR_TXS.append(tx("e8", "2026-09-30", "EUR", "20.00", "DBIT", "CARD_PAYMENT", creditor="Cinema"))
n = bank_sync.sync_user(UID, client)
check("settled under a new reference: old pending removed, settled one added", n == 1 and doc_for("e7") is None and doc_for("e8")["pending"] is False)
count_before_reconnect = len(txs())

# 4. Errors
client.fail = EnableBankingError(401, '{"error":"EXPIRED_SESSION"}')
check("expired session imports nothing", bank_sync.sync_user(UID, client) == 0)
accounts = {p: d for p, d in db.store.items() if p.startswith(f"users/{UID}/accounts/")}
check("expired session -> reconnect-needed", all(a["status"] == "reconnect-needed" for a in accounts.values()))
client.fail = EnableBankingError(503, "down")
for p in accounts:
    db.store[p]["status"] = "active"
bank_sync.sync_user(UID, client)
accounts = {p: d for p, d in db.store.items() if p.startswith(f"users/{UID}/accounts/")}
check("transient error keeps status active", all(a["status"] == "active" and a["lastError"] for a in accounts.values()))

# 5. Reconnect sharing only EUR disconnects GBP
client.fail = None
orig = client.create_session
client.create_session = lambda code: {**orig(code), "accounts": orig(code)["accounts"][:1]}
db.store["bankAuthStates/again"] = {"uid": UID, "createdAt": bank_sync._now_ms()}
bank_sync.finish_connect(UID, "the-code", "again", client)
accounts = {p: d for p, d in db.store.items() if p.startswith(f"users/{UID}/accounts/")}
gbp = next(a for a in accounts.values() if a["currency"] == "GBP")
check("unshared account marked disconnected", gbp["status"] == "disconnected")
check("its secret deleted", len([p for p in db.store if p.startswith(f"bankSecrets/{UID}/accounts/")]) == 1)
check("reconnect does not duplicate transactions", len(txs()) == count_before_reconnect)

print("\nALL PASSED" if not failed else "\nSOME FAILED")
sys.exit(1 if failed else 0)
