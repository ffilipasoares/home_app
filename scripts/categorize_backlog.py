#!/usr/bin/env python3
"""Categorizes every transaction still waiting for a category, and keeps
going until none are left. For catching up once (e.g. after the first bank
import); day to day, each transaction is categorized as it arrives and the
nightly job retries any failure.

Runs the same code as the deployed functions (functions/main.py), on your
machine, against your real Firestore and Vertex AI, with your own Google
account. Every transaction and every error is printed as it happens.

Setup (once):
    gcloud auth application-default login
    gcloud auth application-default set-quota-project home-app-1e7e3

Run:
    cd functions && source venv/bin/activate && cd ..
    GOOGLE_CLOUD_PROJECT=home-app-1e7e3 python3 scripts/categorize_backlog.py
"""

import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "functions"))

if not (os.environ.get("GOOGLE_CLOUD_PROJECT") or os.environ.get("GCLOUD_PROJECT")):
    sys.exit("Set GOOGLE_CLOUD_PROJECT=home-app-1e7e3 (see the header of this script).")

import main  # noqa: E402  (initializes firebase_admin with your credentials)

# One pass is capped so a stuck call can't hang forever; passes repeat
# until nothing is left or a pass makes no progress at all.
PASS_SECONDS = 600


def run() -> None:
    uids = main._user_ids()
    print(f"Users with data: {len(uids)}")
    for uid in uids:
        pass_number = 0
        while True:
            pass_number += 1
            # min_age_ms=0: catch up on everything, however recent.
            result = main._categorize_pending(uid, time.monotonic() + PASS_SECONDS, min_age_ms=0)
            print(f"[{uid}] pass {pass_number}: {result}")
            if result["remaining"] == 0 and result["failed"] == 0:
                print(f"[{uid}] All transactions are categorized.")
                break
            if result["done"] == 0:
                print(f"[{uid}] Stopping: nothing could be categorized this pass. Last error: {result['lastError']}")
                break


if __name__ == "__main__":
    run()
