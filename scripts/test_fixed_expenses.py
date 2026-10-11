#!/usr/bin/env python3
"""Offline test of fixed-expense categories: the dashboard counts each fixed
expense in its category (an investments one in Investments instead), and
main._categorize_fixed_expenses fills in missing categories without
touching ones you chose or items edited meanwhile. No network, no
credentials: Firestore and the agent are stubbed.

Run:
    cd functions && source venv/bin/activate && cd ..
    python3 scripts/test_fixed_expenses.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "functions"))

import firebase_admin  # noqa: E402

firebase_admin.initialize_app = lambda *a, **k: None  # main.py calls it on import

import dashboard  # noqa: E402
import main  # noqa: E402

failures = 0


def check(label, cond):
    global failures
    print(("PASS " if cond else "FAIL ") + label)
    failures += 0 if cond else 1


CATEGORIES = [
    {"id": "salary", "label": "Salary", "special": "income"},
    {"id": "food", "label": "Food"},
    {"id": "needs", "label": "Needs"},
    {"id": "invest", "label": "Invest", "special": "savings"},
]
BY_ID = {c["id"]: c for c in CATEGORIES}
RATES = {"EUR": 1.0, "GBP": 1.2}  # into EUR


# --- Dashboard ----------------------------------------------------------------
def view(fixed, transactions=()):
    return dashboard._view(
        "EUR", list(transactions), BY_ID, RATES, "2026-10-31", None, (0.0, "EUR"), fixed, {"type": "fixed", "value": 0}
    )


txs = [{"category": "needs", "amount": -50.0, "amountIn": {"EUR": -50.0}, "date": "2026-10-02", "merchantRaw": "Shop"}]
v = view(
    [
        (1000.0, "GBP", "needs", "Rent"),
        (40.0, "EUR", None, "Gym"),
        (200.0, "EUR", "invest", "Trading 212"),
        (10.0, "EUR", "deleted_category", "Old"),
    ],
    txs,
)
check("fixed expense counts in its category, converted", v["totalsByCategory"]["needs"] == 50.0 + 1200.0)
check("uncategorized fixed expenses grouped", v["totalsByCategory"][dashboard.UNCATEGORIZED_FIXED] == 40.0 + 10.0)
check("investment fixed expense not in categories", "invest" not in v["totalsByCategory"])
check("fixed total excludes the investment", v["fixedExpensesTotal"] == 1200.0 + 40.0 + 10.0)
check("transaction spending unchanged", v["totalExpenses"] == 50.0)
check("money left subtracts fixed once", v["moneyLeft"] == -(50.0 + 1250.0))
check("investment fixed expense in Investments", v["investmentsTotal"] == 200.0 and v["investments"][0]["merchant"] == "Trading 212")
check("fixed investment marked and undated", v["investments"][0]["fixed"] is True and v["investments"][0]["date"] is None)

v = dashboard._view(
    "EUR", txs, BY_ID, RATES, "2026-10-31", (3000.0, "EUR"), (0.0, "EUR"), [(500.0, "EUR", "needs", "Rent")],
    {"type": "fixed", "value": 1000, "currency": "GBP"},
)
check("savings goal converted", v["savingsGoalTarget"] == 1200.0)
check("money left subtracts the savings goal too", v["moneyLeft"] == 3000.0 - 50.0 - 500.0 - 1200.0)
v = dashboard._view("EUR", txs, BY_ID, RATES, "2026-10-31", (3000.0, "EUR"), (0.0, "EUR"), [], {"type": "percent", "value": 10})
check("percent goal: share of income, subtracted", v["savingsGoalTarget"] == 300.0 and v["moneyLeft"] == 3000.0 - 50.0 - 300.0)

inv_tx = [{"category": "invest", "amount": -30.0, "amountIn": {"EUR": -30.0}, "date": "2026-10-05", "merchantRaw": "T212"}]
v = view([(200.0, "EUR", "invest", "Trading 212")], inv_tx)
check("fixed investment listed before dated ones", [i["merchant"] for i in v["investments"]] == ["Trading 212", "T212"])
check("investments add up", v["investmentsTotal"] == 230.0)


# --- Auto-categorizing --------------------------------------------------------
class Snap:
    def __init__(self, data):
        self._data = data

    def to_dict(self):
        return None if self._data is None else {**self._data, "fixedExpenses": [dict(i) for i in self._data["fixedExpenses"]]}


class UserRef:
    def __init__(self, data):
        self.data, self.updates, self.on_get = data, [], None

    def get(self):
        if self.on_get:
            self.on_get(self)
        return Snap(self.data)

    def update(self, patch):
        self.updates.append(patch)
        self.data = {**self.data, **patch}


class FakeDB:
    def __init__(self, ref):
        self.ref = ref

    def collection(self, _name):
        return self

    def document(self, _uid):
        return self.ref


calls = []


async def fake_agent(label, amount, categories, rules):
    calls.append((label, amount, [c["id"] for c in categories]))
    if label == "Mystery":
        raise main.CategorizationError("no idea")
    return {"category": "needs", "confidence": 0.9}


main.categorize_transaction = fake_agent
main._load_categories = lambda uid: CATEGORIES
main.list_recent_category_rules = lambda uid: []
main.find_exact_category_rule = lambda uid, merchant: {"category": "food"} if merchant == "PADARIA" else None


def run(items, on_get=None):
    ref = UserRef({"fixedExpenses": items})
    ref.on_get = on_get
    main.firestore.client = lambda: FakeDB(ref)
    calls.clear()
    return main._categorize_fixed_expenses("u1"), ref


wrote, ref = run(
    [
        {"id": "a", "label": "Rent", "amount": 1000},
        {"id": "b", "label": "Padaria", "amount": 30},
        {"id": "c", "label": "Gym", "amount": 40, "category": "food", "categorySource": "user"},
        {"id": "d", "label": "  ", "amount": 5},
        {"id": "e", "label": "Mystery", "amount": 9},
    ]
)
items = {i["id"]: i for i in ref.data["fixedExpenses"]}
check("wrote once", wrote and len(ref.updates) == 1)
check("agent picks a category, marked auto", items["a"]["category"] == "needs" and items["a"]["categorySource"] == "auto")
check("agent sees money out, never the income category", calls[0][1] == -1000 and "salary" not in calls[0][2])
check("learned rule used without the agent", items["b"]["category"] == "food" and all(c[0] != "Padaria" for c in calls))
check("your own category untouched", items["c"]["category"] == "food" and items["c"]["categorySource"] == "user")
check("blank label skipped", "category" not in items["d"])
check("agent failure leaves it for later", "category" not in items["e"])

wrote, ref = run([{"id": "a", "label": "Rent", "amount": 1000, "category": "needs", "categorySource": "auto"}])
check("nothing to do: no write, no agent call (no trigger loop)", not wrote and not ref.updates and not calls)

wrote, ref = run([{"id": "e", "label": "Mystery", "amount": 9}])
check("only failures: no write", not wrote and not ref.updates)

reads = []


def renamed_meanwhile(r):
    reads.append(1)
    if len(reads) == 2:  # the re-read after the agent answered
        r.data = {"fixedExpenses": [{"id": "a", "label": "Rent flat 2", "amount": 1000}, {"id": "n", "label": "New", "amount": 1}]}


wrote, ref = run([{"id": "a", "label": "Rent", "amount": 1000}], on_get=renamed_meanwhile)
check("item renamed meanwhile isn't given the old name's category", not wrote and "category" not in ref.data["fixedExpenses"][0])
check("item added meanwhile kept", [i["id"] for i in ref.data["fixedExpenses"]] == ["a", "n"])

print("\nALL PASSED" if failures == 0 else f"\n{failures} FAILED")
sys.exit(1 if failures else 0)
