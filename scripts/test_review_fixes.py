#!/usr/bin/env python3
"""Offline test of the review fixes: refunds net against their category,
fixed expenses reported per category (for the projection), closed months
keeping the settings they were worked out with, generic merchant names
never becoming learned rules, known merchants categorized during the sync,
and the transaction trigger not recomputing twice. No network, no
credentials: Firestore, rates and the agent are stubbed.

Run:
    cd functions && source venv/bin/activate && cd ..
    python3 scripts/test_review_fixes.py
"""

import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "functions"))

import firebase_admin  # noqa: E402

firebase_admin.initialize_app = lambda *a, **k: None  # main.py calls it on import

import bank_sync  # noqa: E402
import dashboard  # noqa: E402
import main  # noqa: E402
from category_rules import is_rule_key  # noqa: E402
from merchant import normalize_merchant  # noqa: E402

failures = 0


def check(label, cond):
    global failures
    print(("PASS " if cond else "FAIL ") + label)
    failures += 0 if cond else 1


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
        self.db.store[self.path].update(data)


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


class FakeDB:
    def __init__(self):
        self.store = {}

    def collection(self, name):
        return ColRef(self, name)

    def get_all(self, refs):
        return [ref.get() for ref in refs]


CATEGORIES = [
    {"id": "salary", "label": "Salary", "special": "income"},
    {"id": "food", "label": "Food"},
    {"id": "needs", "label": "Needs"},
    {"id": "invest", "label": "Invest", "special": "savings"},
]
BY_ID = {c["id"]: c for c in CATEGORIES}


def t(category, amount, date="2026-10-05"):
    return {"category": category, "amount": amount, "amountIn": {"EUR": amount}, "date": date, "merchantRaw": "X"}


def view(transactions, fixed=()):
    return dashboard._view(
        "EUR", list(transactions), BY_ID, {"EUR": 1.0}, "2026-10-31", (3000.0, "EUR"), (0.0, "EUR"), list(fixed),
        {"type": "fixed", "value": 0},
    )


# --- Refunds net against their category --------------------------------------
v = view([t("food", -40.0), t("food", 20.0), t("needs", 30.0)])
check("refund takes off its category (40 out, 20 back = 20)", v["totalsByCategory"].get("food") == 20.0)
check("a category with more back than out drops out, not negative", "needs" not in v["totalsByCategory"])
check("spending total is the net, floored per category", v["totalExpenses"] == 20.0)
check("money left uses the net spending", v["moneyLeft"] == 3000.0 - 20.0)
v = view([t("salary", 3000.0), t("invest", -200.0), t("food", -10.0)])
check("income and investments not netted into spending", v["totalExpenses"] == 10.0 and v["investmentsTotal"] == 200.0)

# --- Fixed expenses per category, for the projection ---------------------------
v = view([t("needs", -50.0)], [(1000.0, "EUR", "needs", "Rent"), (40.0, "EUR", None, "Gym"), (200.0, "EUR", "invest", "T212")])
check("fixedByCategory holds each category's fixed part", v["fixedByCategory"] == {"needs": 1000.0, dashboard.UNCATEGORIZED_FIXED: 40.0})
check("totals still include the fixed part", v["totalsByCategory"]["needs"] == 1050.0)

# --- Closed months keep their settings -----------------------------------------
db = FakeDB()
dashboard.firestore.client = lambda: db
dashboard.get_rate = lambda base, quote, d: 1.0 if base == quote else 1.2
dashboard._current_month = lambda: "2026-10"
USER = "users/u1"
db.store[f"{USER}/settings/categories"] = {"categories": CATEGORIES}


def settings(rent):
    db.store[USER] = {
        "fixedExpenses": [{"id": "r", "label": "Rent", "amount": rent, "category": "needs"}],
        "savingsGoal": {"type": "fixed", "value": 100},
        "filipaSalaryAmount": 3000,
        "displayCurrency": "EUR",
    }


def fixed_total(month):
    return db.store[f"{USER}/dashboards/{month}"]["views"]["EUR"]["fixedExpensesTotal"]


settings(1000)
dashboard.recompute_month("u1", "2026-09")
check("closed month with no basis yet takes today's settings", fixed_total("2026-09") == 1000)
check("basis saved, only the fields that shape the figures",
      set(db.store[f"{USER}/dashboards/2026-09"]["basis"]) == {"fixedExpenses", "savingsGoal", "filipaSalaryAmount"})
settings(1500)
dashboard.recompute_month("u1", "2026-09")
check("closed month keeps the rent it closed with", fixed_total("2026-09") == 1000)
dashboard.recompute_month("u1", "2026-10")
check("open month follows Settings", fixed_total("2026-10") == 1500)
settings(1700)
dashboard.recompute_month("u1", "2026-10")
check("open month keeps following Settings after a basis is saved", fixed_total("2026-10") == 1700)

# --- Merchant names and rule keys ----------------------------------------------
NORMALIZED = {
    "Trading 212": "TRADING 212",
    "7-Eleven Lisboa": "7 ELEVEN LISBOA",
    "LIDL 4521 LISBOA": "LIDL LISBOA",
    "Café Ñandú": "CAFE NANDU",
    "12345": "",
    "***": "",
    "Pingo Doce, Alvalade": "PINGO DOCE ALVALADE",
}
for raw, want in NORMALIZED.items():
    check(f"normalize {raw!r} -> {want!r}", normalize_merchant(raw) == want)
check("generic and empty names aren't rule keys",
      not any(is_rule_key(k) for k in ["", "MBWAY", "MB WAY", "TRANSFER", "PAYPAL", "REVOLUT", "TOP UP"]))
check("real merchants are rule keys", all(is_rule_key(k) for k in ["TRADING 212", "PINGO DOCE", "MBWAY PADARIA"]))

# --- Known merchants categorized during the sync ---------------------------------
db = FakeDB()
db.store[f"{USER}/settings/categories"] = {"categories": CATEGORIES}
for key, category in {"PINGO DOCE": "food", "ACME": "salary", "OLD SHOP": "deleted", "MBWAY": "food"}.items():
    db.store[f"{USER}/categoryRules/{key}"] = {"category": category}


def new_tx(merchant, date="2026-10-03", **extra):
    return {"merchantNormalized": merchant, "date": date, "month": date[:7], "needsReview": True, "category": None, **extra}


txs = [
    new_tx("PINGO DOCE"),
    new_tx("UNKNOWN SHOP"),
    new_tx("OLD SHOP"),
    new_tx("MBWAY"),
    new_tx("PINGO DOCE", internalTransfer=True),
    new_tx("ACME", date="2026-10-27"),
]
done = bank_sync._apply_learned_categories(db, DocRef(db, USER), txs)
check("one write for a known merchant: categorized before saving",
      txs[0]["category"] == "food" and txs[0]["needsReview"] is False and txs[0]["source"] == "auto")
check("unknown merchant left for the agent", txs[1]["category"] is None and txs[1]["needsReview"])
check("rule for a deleted category ignored", txs[2]["category"] is None)
check("generic name never matched, even with a rule", txs[3]["category"] is None)
check("move between own accounts untouched", txs[4]["category"] is None)
check("late-month salary moves to next month", txs[5]["category"] == "salary" and txs[5]["month"] == "2026-11")
check("count of categorized", done == 2)

# --- The trigger recomputes once -------------------------------------------------
recomputed = []
categorize_result = [True]
main.recompute_month = lambda uid, month: recomputed.append(month)
main._categorize_safely = lambda uid, tx_id, tx: categorize_result[0]
main._ensure_display_amounts = lambda uid, tx_id, tx: False
main._load_categories = lambda uid: CATEGORIES
db = FakeDB()
main.firestore.client = lambda: db


def fire(before, after):
    recomputed.clear()
    snap = lambda d: SimpleNamespace(to_dict=lambda: dict(d)) if d is not None else None  # noqa: E731
    event = SimpleNamespace(params={"uid": "u1", "txId": "t1"}, data=SimpleNamespace(before=snap(before), after=snap(after)))
    main.on_transaction_write.__wrapped__(event)


waiting = new_tx("UNKNOWN SHOP")
fire(None, waiting)
check("agent categorized it: no recompute here (its own write does it)", recomputed == [])
categorize_result[0] = False
fire(None, waiting)
check("agent failed: recompute so it shows as needing review", recomputed == ["2026-10"])

edited = {**new_tx("PINGO DOCE"), "category": "food", "needsReview": False, "source": "manual-edit"}
fire(edited, {**edited, "note": "Weekly shop"})
check("editing only the note teaches no rule", f"{USER}/categoryRules/PINGO DOCE" not in db.store)
check("...and still recomputes", recomputed == ["2026-10"])
fire({**edited, "category": "needs"}, edited)
check("changing the category teaches the rule", db.store.get(f"{USER}/categoryRules/PINGO DOCE", {}).get("category") == "food")
generic = {**edited, "merchantNormalized": "MBWAY"}
fire({**generic, "category": "needs"}, generic)
check("a generic name is never learned", f"{USER}/categoryRules/MBWAY" not in db.store)

# --- "Don't count this" ------------------------------------------------------------
db = FakeDB()
dashboard.firestore.client = lambda: db
db.store[USER] = {"fixedExpenses": [], "savingsGoal": {"type": "fixed", "value": 0}, "filipaSalaryAmount": 3000}
db.store[f"{USER}/settings/categories"] = {"categories": CATEGORIES}
for i, tx in enumerate([
    {**t("food", -40.0), "month": "2026-10"},
    {**t("food", 500.0), "month": "2026-10", "ignored": True},  # a friend's money to pass on
    {**t("food", -500.0), "month": "2026-10", "ignored": True, "pending": True},
    {**t("salary", 900.0), "month": "2026-10", "ignored": True},
    {"amount": -25.0, "amountIn": {"EUR": -25.0}, "date": "2026-10-06", "month": "2026-10", "needsReview": True, "category": None, "ignored": True},
]):
    db.store[f"{USER}/transactions/x{i}"] = tx
dashboard.recompute_month("u1", "2026-10")
d = db.store[f"{USER}/dashboards/2026-10"]
check("ignored money in or out changes no total", d["views"]["EUR"]["totalExpenses"] == 40.0)
check("ignored income isn't detected salary", d["views"]["EUR"]["autoDetectedFilipaSalary"] == 0)
check("ignored ones aren't waiting for review or pending", d["needsReviewCount"] == 0 and d["pendingCount"] == 0)
check("the AI isn't asked to categorize an ignored one", not main._awaiting_auto_category({**new_tx("SHOP"), "ignored": True}))
check("...but is once it counts again", main._awaiting_auto_category(new_tx("SHOP")))

print("\nALL PASSED" if failures == 0 else f"\n{failures} FAILED")
sys.exit(1 if failures else 0)
