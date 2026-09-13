#!/usr/bin/env python3
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

Setup (once):
    cd functions && source venv/bin/activate && cd ..
    pip install requests

Env vars (every command needs the first two):
    ENABLE_BANKING_APP_ID           your application's ID (the console's
                                     "Application ID", also the JWT `kid`)
    ENABLE_BANKING_PRIVATE_KEY_PATH local path to the .pem private key you
                                     downloaded when creating the
                                     application (never commit this file,
                                     never paste its contents anywhere)
    ENABLE_BANKING_REDIRECT_URL     defaults to
                                     http://localhost:5173/bank-callback
                                     (must exactly match one of the
                                     redirect URLs registered on the
                                     application)

Usage — run these one at a time, in order; steps 2-3 need you to actually
complete a (fake, in sandbox) bank login in a browser in between:

    # 1. See what banks/ASPSPs are available to connect to in this
    #    environment (sandbox = fake test banks, not real Revolut).
    python3 scripts/test_enable_banking.py list-banks --country FI

    # 2. Start a connection to one of them. Prints a URL — open it in a
    #    browser and complete the (fake) login/consent. It redirects you
    #    to ENABLE_BANKING_REDIRECT_URL with ?code=...&state=... in the
    #    query string — copy the `code` value out of that URL.
    python3 scripts/test_enable_banking.py connect --bank "Mock ASPSP" --country FI

    # 3. Exchange that code for a session — this is what actually proves
    #    the consent worked, and shows the real shape of the accounts list
    #    (uid, currency, IBAN, etc. — this is the part the quick-start PDF
    #    doesn't fully document, so this is us finding out for real).
    python3 scripts/test_enable_banking.py exchange --code PASTE_CODE_HERE

    # 4. Pull balances + transactions for one of the account uids step 3
    #    printed, to see the real transaction field shapes.
    python3 scripts/test_enable_banking.py fetch --account PASTE_ACCOUNT_UID_HERE
"""

import argparse
import json
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone

import jwt as pyjwt
import requests

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


def _pretty(resp: requests.Response) -> None:
    print(f"-> {resp.status_code} {resp.reason}")
    try:
        print(json.dumps(resp.json(), indent=2))
    except ValueError:
        print(resp.text)


def cmd_list_banks(args: argparse.Namespace) -> None:
    r = requests.get(f"{API_BASE}/aspsps", params={"country": args.country}, headers=_auth_headers())
    _pretty(r)


def cmd_connect(args: argparse.Namespace) -> None:
    redirect_url = os.environ.get("ENABLE_BANKING_REDIRECT_URL", "http://localhost:5173/bank-callback")
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
    _pretty(r)
    if r.ok:
        accounts = r.json().get("accounts", [])
        print(f"\n{len(accounts)} account(s) in this session:")
        for acc in accounts:
            print(f"  uid={acc.get('uid')}")


def cmd_fetch(args: argparse.Namespace) -> None:
    headers = _auth_headers()
    print("Balances:")
    _pretty(requests.get(f"{API_BASE}/accounts/{args.account}/balances", headers=headers))
    print("\nTransactions:")
    _pretty(requests.get(f"{API_BASE}/accounts/{args.account}/transactions", headers=headers))


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

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
