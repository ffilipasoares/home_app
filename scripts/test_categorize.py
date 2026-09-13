#!/usr/bin/env python3
"""Dev-only script to exercise the categorization agent directly — no
Firestore, no deployed Cloud Function, just the agent against a handful
of sample transactions. The fastest way to see how it behaves and iterate
on functions/categorize.py's instruction/tools before trusting it in the
real pipeline.

Setup (once):
    gcloud auth application-default login
    gcloud config set project <your-firebase-project-id>

Run:
    cd functions && source venv/bin/activate && cd ..
    GOOGLE_CLOUD_PROJECT=<your-firebase-project-id> python3 scripts/test_categorize.py

Edit SAMPLE_CATEGORIES / SAMPLE_RULES / SAMPLE_TRANSACTIONS below to match
what you actually want to test — real category ids from your Settings,
real-looking merchant strings from an actual statement, etc.
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "functions"))

from categorize import categorize_transaction  # noqa: E402

# Mirrors the default taxonomy (lib/categories.ts) — edit to match your
# real Settings categories if you've changed them.
SAMPLE_CATEGORIES = [
    {"id": "salary", "label": "Salary", "special": "income"},
    {"id": "food", "label": "Food"},
    {"id": "transport", "label": "Transport"},
    {"id": "needs", "label": "Needs"},
    {"id": "invest", "label": "Invest", "special": "savings"},
    {"id": "entertainment", "label": "Entertainment"},
    {"id": "others", "label": "Others"},
]

# Pretend the cache already knows a few merchants — this is what lets the
# agent reason "UBER EATS is probably like UBER" instead of guessing blind.
SAMPLE_RULES = [
    {"merchantNormalized": "UBER", "category": "transport", "timesConfirmed": 3, "lastUpdated": 0},
    {"merchantNormalized": "CONTINENTE", "category": "food", "timesConfirmed": 5, "lastUpdated": 0},
]

# (merchant, amount) — negative = money out. Swap in real merchant strings
# you've actually seen on a statement to test realistically.
SAMPLE_TRANSACTIONS = [
    ("UBER EATS LISBOA 4521", -18.30),
    ("NETFLIX.COM", -12.99),
    ("FARMACIA SAO BENTO", -8.50),
    ("XPTO RANDOM MERCHANT 998", -34.20),
]


async def main() -> None:
    for merchant, amount in SAMPLE_TRANSACTIONS:
        result = await categorize_transaction(merchant, amount, SAMPLE_CATEGORIES, SAMPLE_RULES)
        if result is None:
            print(f"{merchant!r:40} -> NO CONFIDENT ANSWER (would stay uncategorized)")
        else:
            print(f"{merchant!r:40} -> {result['category']:15} confidence={result['confidence']:.2f}")


if __name__ == "__main__":
    asyncio.run(main())
