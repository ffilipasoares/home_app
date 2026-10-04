#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "PyJWT[crypto]>=2.9.0",
#     "requests>=2.31",
# ]
# ///
"""Dev-only script to exercise the real Enable Banking sandbox API directly
— no Firestore, no deployed Cloud Function, no UI. Mirrors the flow from
Enable Banking's own "Quick Start" doc so we can see the *actual* JSON
shapes (account fields, session fields, transaction fields) before wiring
any of this into functions/ or the app/'s Connect Revolut UI.

This talks to https://api.enablebanking.com over the network, so it only
works run from a machine with real internet access to that host — it will
NOT work from a sandboxed dev environment with egress restrictions. Run it
from your own laptop.

Your private key never needs to be pasted anywhere (not into chat, not
into this file) — it's read from a local path you point at with an env
var.

Setup: just have uv installed (https://docs.astral.sh/uv/). `uv run`
reads the dependency block at the top of this file and runs the script in
its own throwaway environment with exactly those packages, so whatever is
in your conda/micromamba/venv can't shadow or break them. No venv to
activate, no pip install.

Env vars (every command needs the first two):
    ENABLE_BANKING_APP_ID           your application's ID (the console's
                                     "Application ID", also the JWT `kid`)
    ENABLE_BANKING_PRIVATE_KEY_PATH local path to the .pem private key you
                                     downloaded when creating the
                                     application (never commit this file,
                                     never paste its contents anywhere)
    ENABLE_BANKING_REDIRECT_URL     defaults to
                                     https://home-app-1e7e3.web.app/bank-callback
                                     (must exactly match one of the
                                     redirect URLs registered on the
                                     application; production applications
                                     only accept https URLs, so no
                                     localhost there)

Usage — run these one at a time, in order; steps 2-3 need you to actually
complete a (fake, in sandbox) bank login in a browser in between:

    # 1. See what banks/ASPSPs are available to connect to in this
    #    environment (sandbox = fake test banks, not real Revolut).
    uv run scripts/test_enable_banking.py list-banks --country FI

    # 2. Start a connection to one of them. Prints a URL — open it in a
    #    browser and complete the (fake) login/consent. It redirects you
    #    to ENABLE_BANKING_REDIRECT_URL with ?code=...&state=... in the
    #    query string — copy the `code` value out of that URL.
    uv run scripts/test_enable_banking.py connect --bank "Mock ASPSP" --country FI

    # 3. Exchange that code for a session — this is what actually proves
    #    the consent worked, and shows the real shape of the accounts list
    #    (uid, currency, IBAN, etc. — this is the part the quick-start PDF
    #    doesn't fully document, so this is us finding out for real).
    uv run scripts/test_enable_banking.py exchange --code PASTE_CODE_HERE

    # 4. Pull balances + transactions for one of the account uids step 3
    #    printed, to see the real transaction field shapes.
    uv run scripts/test_enable_banking.py fetch --account PASTE_ACCOUNT_UID_HERE

With a real bank (a production application), add --redact to `exchange`
and `fetch` before sharing their output anywhere: names, IBANs, amounts
and free text are replaced with placeholders, while the structure, codes,
currencies and dates stay visible.
"""

import argparse
import json
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone

import jwt as pyjwt
import requests

# Two unrelated PyPI packages ("jwt" and "python-jwt") also install a
# module named `jwt`, and either one shadows PyJWT, which is what this
# script needs. Fail with the fix instead of a bare AttributeError.
if not hasattr(pyjwt, "encode"):
    sys.exit(
        f"The `jwt` module loaded from {getattr(pyjwt, '__file__', '?')} is not PyJWT.\n"
        "Fix: run it with `uv run scripts/test_enable_banking.py ...`, which installs "
        "the right packages in an isolated environment."
    )

API_BASE = "https://api.enablebanking.com"


def _auth_headers() -> dict:
    app_id = os.environ.get("ENABLE_BANKING_APP_ID")
    key_path = os.environ.get("ENABLE_BANKING_PRIVATE_KEY_PATH")
    if not app_id or not key_path:
        sys.exit("Set ENABLE_BANKING_APP_ID and ENABLE_BANKING_PRIVATE_KEY_PATH first.")
    private_key = open(key_path, "rb").read()
    iat = int(datetime.now(timezone.utc).timestamp())
    token = pyjwt.encode(
        {
            "iss": "enablebanking.com",
            "aud": "api.enablebanking.com",
            "iat": iat,
            "exp": iat + 3600,
        },
        private_key,
        algorithm="RS256",
        headers={"kid": app_id},
    )
    return {"Authorization": f"Bearer {token}"}


# Values under these keys are codes, dates or currencies, never personal,
# so --redact keeps them. Everything else (names, IBANs, amounts, ids,
# free-text remittance info) is replaced with a placeholder.
SAFE_KEYS = {
    "currency", "credit_debit_indicator", "status", "balance_type",
    "cash_account_type", "usage", "scheme_name", "code", "sub_code",
    "psu_status", "psu_type", "product", "merchant_category_code",
    "booking_date", "value_date", "transaction_date", "reference_date",
    "valid_until", "country",
}
REDACTED_TRANSACTIONS_SHOWN = 5


def _redact(value, key=None):
    if isinstance(value, dict):
        return {k: _redact(v, k) for k, v in value.items()}
    if isinstance(value, list):
        return [_redact(v, key) for v in value]
    if value is None or isinstance(value, bool) or key in SAFE_KEYS:
        return value
    if isinstance(value, str):
        return f"<redacted, {len(value)} chars>"
    return f"<redacted {type(value).__name__}>"


def _pretty(resp: requests.Response, redact: bool = False) -> None:
    print(f"-> {resp.status_code} {resp.reason}")
    try:
        data = resp.json()
    except ValueError:
        print(resp.text)
        return
    if redact:
        txs = data.get("transactions") if isinstance(data, dict) else None
        if isinstance(txs, list) and len(txs) > REDACTED_TRANSACTIONS_SHOWN:
            data = {**data, "transactions": txs[:REDACTED_TRANSACTIONS_SHOWN]}
            print(f"(showing {REDACTED_TRANSACTIONS_SHOWN} of {len(txs)} transactions)")
        data = _redact(data)
    print(json.dumps(data, indent=2, ensure_ascii=False))


def cmd_list_banks(args: argparse.Namespace) -> None:
    r = requests.get(f"{API_BASE}/aspsps", params={"country": args.country}, headers=_auth_headers())
    _pretty(r)


def cmd_connect(args: argparse.Namespace) -> None:
    redirect_url = os.environ.get("ENABLE_BANKING_REDIRECT_URL", "https://home-app-1e7e3.web.app/bank-callback")
    state = str(uuid.uuid4())
    body = {
        "access": {
            "valid_until": (datetime.now(timezone.utc) + timedelta(days=10)).isoformat(),
        },
        "aspsp": {"name": args.bank, "country": args.country},
        "state": state,
        "redirect_url": redirect_url,
        "psu_type": "personal",
    }
    print(f"Request body:\n{json.dumps(body, indent=2)}\n")
    r = requests.post(f"{API_BASE}/auth", json=body, headers=_auth_headers())
    _pretty(r)
    if r.ok:
        print(f"\nstate sent (verify it comes back unchanged on the redirect): {state}")
        print(f"Open this URL to authenticate:\n{r.json()['url']}")


def cmd_exchange(args: argparse.Namespace) -> None:
    r = requests.post(f"{API_BASE}/sessions", json={"code": args.code}, headers=_auth_headers())
    _pretty(r, args.redact)
    if r.ok:
        accounts = r.json().get("accounts", [])
        # Printed unredacted even with --redact: you need the uid for
        # `fetch`, and it's useless without your private key. No need to
        # paste this part anywhere.
        print(f"\n{len(accounts)} account(s) in this session (for your own use with `fetch`):")
        for acc in accounts:
            print(f"  uid={acc.get('uid')}  currency={acc.get('currency')}")


def cmd_fetch(args: argparse.Namespace) -> None:
    headers = _auth_headers()
    print("Balances:")
    _pretty(requests.get(f"{API_BASE}/accounts/{args.account}/balances", headers=headers), args.redact)
    print("\nTransactions:")
    _pretty(requests.get(f"{API_BASE}/accounts/{args.account}/transactions", headers=headers), args.redact)


def cmd_summary(args: argparse.Namespace) -> None:
    """Pages through every transaction and prints only counts, codes and
    dates (no names, amounts or free text), safe to share. It checks how
    far back history goes, whether date_from and paging work, whether
    entry_reference is unique, and which transaction types exist."""
    from collections import Counter

    headers = _auth_headers()
    params = {"date_from": args.date_from} if args.date_from else {}
    txs, pages = [], 0
    while True:
        r = requests.get(f"{API_BASE}/accounts/{args.account}/transactions", params=params, headers=headers)
        if not r.ok:
            print(f"Page {pages + 1} failed:")
            _pretty(r, redact=True)
            break
        body = r.json()
        pages += 1
        txs.extend(body.get("transactions", []))
        key = body.get("continuation_key")
        if not key:
            break
        params = {**params, "continuation_key": key}

    def has(t, party):
        return bool((t.get(party) or {}).get("name"))

    refs = [t.get("entry_reference") for t in txs]
    dates = sorted(t.get("booking_date") or t.get("value_date") or "" for t in txs)
    print(f"date_from: {args.date_from or '(not set)'}")
    print(f"pages: {pages}   transactions: {len(txs)}")
    if not txs:
        return
    print(f"date range: {dates[0]} -> {dates[-1]}")
    print(f"entry_reference: {len(set(refs))} unique of {len(refs)} ({sum(r is None for r in refs)} missing)")
    print(f"status: {dict(Counter(t.get('status') for t in txs))}")
    print(f"transaction currencies: {dict(Counter(t['transaction_amount']['currency'] for t in txs))}")
    print("type (code, direction): count")
    for (code, cdi), n in Counter(
        ((t.get("bank_transaction_code") or {}).get("code"), t.get("credit_debit_indicator")) for t in txs
    ).most_common():
        print(f"  {code}, {cdi}: {n}")
    for cdi in ("DBIT", "CRDT"):
        group = [t for t in txs if t.get("credit_debit_indicator") == cdi]
        if group:
            print(
                f"{cdi}: {len(group)} total, creditor.name set on {sum(has(t, 'creditor') for t in group)}, "
                f"debtor.name set on {sum(has(t, 'debtor') for t in group)}, "
                f"remittance_information set on {sum(bool(t.get('remittance_information')) for t in group)}"
            )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    p_list = sub.add_parser("list-banks", help="List ASPSPs (banks) available for a country")
    p_list.add_argument("--country", required=True, help="ISO country code, e.g. FI")
    p_list.set_defaults(func=cmd_list_banks)

    p_connect = sub.add_parser("connect", help="Start a consent flow, prints a URL to open in a browser")
    p_connect.add_argument("--bank", required=True, help='ASPSP name exactly as list-banks printed it, e.g. "Mock ASPSP"')
    p_connect.add_argument("--country", required=True)
    p_connect.set_defaults(func=cmd_connect)

    p_exchange = sub.add_parser("exchange", help="Exchange the ?code=... from the redirect for a session")
    p_exchange.add_argument("--code", required=True)
    p_exchange.set_defaults(func=cmd_exchange)

    p_fetch = sub.add_parser("fetch", help="Fetch balances + transactions for one account uid")
    p_fetch.add_argument("--account", required=True)
    p_fetch.set_defaults(func=cmd_fetch)

    p_summary = sub.add_parser("summary", help="Page through all transactions and print counts only (safe to share)")
    p_summary.add_argument("--account", required=True)
    p_summary.add_argument("--date-from", help="YYYY-MM-DD, only fetch transactions from this date")
    p_summary.set_defaults(func=cmd_summary)

    redact_help = "Hide names, IBANs, amounts and free text (use with a real bank before sharing the output)"
    for p in (p_exchange, p_fetch):
        p.add_argument("--redact", action="store_true", help=redact_help)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
