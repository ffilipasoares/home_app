#!/usr/bin/env python3
"""Moves all of the app's data from one Google account to another, so the
new account becomes the app's owner: transactions, settings, salaries,
categories, dashboards, learned category rules and the Revolut connection
(no need to reconnect). From then on the scheduled bank sync updates the
new account only.

The old account's data is left in place as a frozen backup, except its
Revolut connection, which is removed so the sync no longer updates it. Once
the allowed email is changed the old account can't open the app anyway.

Order of steps (SETUP.md has the details):
  1. Change the allowed email to the new one (app/.env.local,
     firestore.rules, functions/.env) and deploy.
  2. Sign in to the app once with the new account (creates it).
  3. Run this script: first without --apply to see what it would copy,
     then with --apply.

Setup (once):
    gcloud auth application-default login
    gcloud auth application-default set-quota-project home-app-1e7e3

Run:
    cd functions && source venv/bin/activate && cd ..
    GOOGLE_CLOUD_PROJECT=home-app-1e7e3 python3 scripts/move_to_account.py \\
        --from old@gmail.com --to new@gmail.com            # dry run
    GOOGLE_CLOUD_PROJECT=home-app-1e7e3 python3 scripts/move_to_account.py \\
        --from old@gmail.com --to new@gmail.com --apply
"""

import argparse
import os
import sys

if not (os.environ.get("GOOGLE_CLOUD_PROJECT") or os.environ.get("GCLOUD_PROJECT")):
    sys.exit("Set GOOGLE_CLOUD_PROJECT=home-app-1e7e3 (see the header of this script).")

import firebase_admin  # noqa: E402
from firebase_admin import auth, firestore  # noqa: E402

_BATCH_LIMIT = 400


def _uid_for(email: str) -> str:
    try:
        return auth.get_user_by_email(email).uid
    except auth.UserNotFoundError:
        sys.exit(f"No app user with {email}. Sign in to the app once with that account first.")


def _copy_tree(src_doc, dst_doc, counts: dict, writes: list) -> None:
    """Copies a document (if it exists) and every subcollection under it."""
    snap = src_doc.get()
    if snap.exists:
        writes.append((dst_doc, snap.to_dict()))
        counts[src_doc.parent.id] = counts.get(src_doc.parent.id, 0) + 1
    for sub in src_doc.collections():
        for child in sub.list_documents():
            _copy_tree(child, dst_doc.collection(sub.id).document(child.id), counts, writes)


def _commit(db, writes: list) -> None:
    for i in range(0, len(writes), _BATCH_LIMIT):
        batch = db.batch()
        for ref, data in writes[i : i + _BATCH_LIMIT]:
            batch.set(ref, data)
        batch.commit()


def move(old_email: str, new_email: str, apply: bool) -> None:
    db = firestore.client()
    old_uid, new_uid = _uid_for(old_email), _uid_for(new_email)
    if old_uid == new_uid:
        sys.exit("Both emails are the same app user; nothing to move.")
    print(f"From {old_email} ({old_uid})\nTo   {new_email} ({new_uid})\n")

    counts: dict[str, int] = {}
    writes: list = []
    _copy_tree(db.collection("users").document(old_uid), db.collection("users").document(new_uid), counts, writes)
    bank_writes: list = []
    bank_counts: dict[str, int] = {}
    old_bank = db.collection("bankSecrets").document(old_uid)
    _copy_tree(old_bank, db.collection("bankSecrets").document(new_uid), bank_counts, bank_writes)

    for name, n in sorted(counts.items()):
        print(f"  {name}: {n}")
    print(f"  Revolut connection: {'yes' if bank_counts.get('accounts') else 'none found'}")

    if not apply:
        print("\nDry run: nothing written. Run again with --apply to move.")
        return

    _commit(db, writes)
    _commit(db, bank_writes)
    # The old account stops syncing; its other data stays as a backup.
    for ref in old_bank.collection("accounts").list_documents():
        ref.delete()
    old_bank.delete()
    print(f"\nMoved {len(writes)} documents. {new_email} is now the account the app syncs into.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--from", dest="old", required=True, help="Current account's email")
    parser.add_argument("--to", dest="new", required=True, help="New account's email")
    parser.add_argument("--apply", action="store_true", help="Actually copy (default: dry run)")
    args = parser.parse_args()
    firebase_admin.initialize_app()
    move(args.old.strip().lower(), args.new.strip().lower(), args.apply)


if __name__ == "__main__":
    main()
