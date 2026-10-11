#!/usr/bin/env python3
"""Offline test: the AI categorizes with the categories currently in
Settings. A learned merchant rule for a category you've since removed is
ignored (the agent decides instead, and never sees that rule as an
example). No network, no credentials: Firestore and the agent are stubbed.

Run:
    cd functions && source venv/bin/activate && cd ..
    python3 scripts/test_categories.py
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "functions"))

import firebase_admin  # noqa: E402

firebase_admin.initialize_app = lambda *a, **k: None  # main.py calls it on import

import main  # noqa: E402

failures = 0


def check(label, cond):
    global failures
    print(("PASS " if cond else "FAIL ") + label)
    failures += 0 if cond else 1


class Ref:
    def __init__(self, store, path):
        self.store, self.path = store, path

    def collection(self, name):
        return Ref(self.store, f"{self.path}/{name}")

    def document(self, name):
        return Ref(self.store, f"{self.path}/{name}")

    def update(self, patch):
        self.store.setdefault(self.path, {}).update(patch)

    def set(self, data, merge=False):
        self.store.setdefault(self.path, {}).update(data)


class DB:
    def __init__(self):
        self.store = {}

    def collection(self, name):
        return Ref(self.store, name)


CATEGORIES = [
    {"id": "salary", "label": "Salary", "special": "income"},
    {"id": "groceries", "label": "Groceries"},
    {"id": "eating_out", "label": "Eating out"},
]
RULES = {
    "PINGO DOCE": {"merchantNormalized": "PINGO DOCE", "category": "groceries"},
    "OLD CAFE": {"merchantNormalized": "OLD CAFE", "category": "food"},  # "food" was removed in Settings
}
agent_calls = []


async def fake_agent(merchant, amount, categories, recent_rules):
    agent_calls.append({"merchant": merchant, "choices": [c["id"] for c in categories], "rules": [r["category"] for r in recent_rules]})
    return {"category": "eating_out", "confidence": 0.9}


db = DB()
main.firestore.client = lambda: db
main._load_categories = lambda uid: CATEGORIES
main.find_exact_category_rule = lambda uid, merchant: RULES.get(merchant)
main.list_recent_category_rules = lambda uid: list(RULES.values())
main.categorize_transaction = fake_agent
main.resolve_budget_month = lambda date, month, special: month


def tx(merchant):
    return {"merchantRaw": merchant, "merchantNormalized": merchant, "amount": -5.0, "date": "2026-10-10", "month": "2026-10"}


asyncio.run(main._auto_categorize("u1", "t1", tx("PINGO DOCE")))
check("a rule for a current category is used without the AI", db.store["users/u1/transactions/t1"]["category"] == "groceries" and not agent_calls)

asyncio.run(main._auto_categorize("u1", "t2", tx("OLD CAFE")))
check("a rule for a removed category is ignored: the AI decides", db.store["users/u1/transactions/t2"]["category"] == "eating_out" and len(agent_calls) == 1)
check("the AI chooses from the current Settings list", agent_calls[0]["choices"] == ["salary", "groceries", "eating_out"])
check("the AI never sees a removed category as an example", "food" not in agent_calls[0]["rules"])

print("\nALL PASSED" if failures == 0 else f"\n{failures} FAILED")
sys.exit(1 if failures else 0)
