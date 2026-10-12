#!/usr/bin/env python3
"""Offline test of the "Sync now" daily limit (main._use_manual_sync): two
a day on top of the scheduled syncs, refused after that, a fresh count the
next Lisbon day. No network, no credentials: Firestore is stubbed.

Run:
    cd functions && source venv/bin/activate && cd ..
    python3 scripts/test_sync_limit.py
"""

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


class Snap:
    def __init__(self, data):
        self._data = data

    def to_dict(self):
        return None if self._data is None else dict(self._data)


class Ref:
    def __init__(self, store, path):
        self.store, self.path = store, path

    def collection(self, name):
        return Ref(self.store, f"{self.path}/{name}")

    def document(self, name):
        return Ref(self.store, f"{self.path}/{name}")

    def get(self):
        return Snap(self.store.get(self.path))

    def set(self, data, merge=False):
        self.store[self.path] = {**(self.store.get(self.path) or {}), **data} if merge else dict(data)


class DB:
    def __init__(self):
        self.store = {"bankSecrets/u1": {"connected": True}}

    def collection(self, name):
        return Ref(self.store, name)


db = DB()
main.firestore.client = lambda: db
today = ["2026-10-12"]
main._lisbon_today = lambda: today[0]

check("first sync allowed, 1 left", main._use_manual_sync("u1") == 1)
check("second sync allowed, 0 left", main._use_manual_sync("u1") == 0)
try:
    main._use_manual_sync("u1")
    check("third sync refused", False)
except main.https_fn.HttpsError as err:
    check("third sync refused", err.code == main.https_fn.FunctionsErrorCode.RESOURCE_EXHAUSTED)
check("count kept server-side", db.store["bankSecrets/u1"]["manualSyncs"] == {"date": "2026-10-12", "count": 2, "limit": 2})
check("other bank data untouched", db.store["bankSecrets/u1"]["connected"] is True)
check("copy for the app", db.store["users/u1"]["manualSyncs"]["count"] == 2)

# Resetting the copy the app can write doesn't give more syncs.
db.store["users/u1"]["manualSyncs"] = {"date": "2026-10-12", "count": 0, "limit": 2}
try:
    main._use_manual_sync("u1")
    check("app-side copy can't reset the limit", False)
except main.https_fn.HttpsError:
    check("app-side copy can't reset the limit", True)

today[0] = "2026-10-13"
check("next day starts again", main._use_manual_sync("u1") == 1)

print("\nALL PASSED" if failures == 0 else f"\n{failures} FAILED")
sys.exit(1 if failures else 0)
