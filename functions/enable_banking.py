"""Minimal Enable Banking API client (https://enablebanking.com/docs/api/).

Every request is authenticated with a short-lived JWT signed by the
application's private RSA key (RS256, `kid` = application ID), exactly as
in Enable Banking's quick start and scripts/test_enable_banking.py. The
key comes from Secret Manager (ENABLE_BANKING_PRIVATE_KEY, declared in
main.py) and is never written anywhere else.

Uses urllib rather than requests, like fx.py, to keep the deployed
dependency list short.
"""

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Iterator

import jwt

API_BASE = "https://api.enablebanking.com"
# Not secret: useless without the private key. Production application,
# Account Information only.
APP_ID = os.environ.get("ENABLE_BANKING_APP_ID", "ff3bde28-12b3-4bac-bb95-155916c07cb7")
# The ASPSP entry that returned both the EUR and GBP joint accounts under
# one consent (see docs/ARCHITECTURE.md §11, Phase 2 step 2).
ASPSP_NAME = os.environ.get("ENABLE_BANKING_ASPSP_NAME", "Revolut")
ASPSP_COUNTRY = os.environ.get("ENABLE_BANKING_ASPSP_COUNTRY", "PT")
# Must exactly match a redirect URL registered on the application.
REDIRECT_URL = os.environ.get("ENABLE_BANKING_REDIRECT_URL", "https://home-app-1e7e3.web.app/bank-callback")

_TIMEOUT_SECONDS = 30
_JWT_TTL_SECONDS = 3600
# Used when the ASPSP doesn't report its own maximum.
DEFAULT_CONSENT_SECONDS = 90 * 24 * 3600


class EnableBankingError(Exception):
    def __init__(self, status: int, body: str):
        super().__init__(f"Enable Banking API error {status}: {body[:500]}")
        self.status = status
        self.body = body

    @property
    def needs_reconnect(self) -> bool:
        """True when the session itself is no longer usable (expired,
        revoked in the bank's app, or closed), as opposed to a transient
        failure worth retrying on the next run."""
        if self.status in (401, 403):
            return True
        text = self.body.upper()
        return any(marker in text for marker in ("EXPIRED", "REVOKED", "CLOSED_SESSION", "SESSION_DOES_NOT_EXIST"))


class Client:
    def __init__(self, private_key_pem: str, app_id: str = APP_ID):
        if not private_key_pem:
            raise ValueError("ENABLE_BANKING_PRIVATE_KEY is empty: set the secret before deploying (see SETUP.md).")
        self._key = private_key_pem
        self._app_id = app_id

    def _token(self) -> str:
        iat = int(time.time())
        return jwt.encode(
            {"iss": "enablebanking.com", "aud": "api.enablebanking.com", "iat": iat, "exp": iat + _JWT_TTL_SECONDS},
            self._key,
            algorithm="RS256",
            headers={"kid": self._app_id},
        )

    def _request(self, method: str, path: str, params: dict | None = None, body: dict | None = None) -> Any:
        url = f"{API_BASE}{path}"
        if params:
            url += "?" + urllib.parse.urlencode(params)
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Authorization", f"Bearer {self._token()}")
        if data is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=_TIMEOUT_SECONDS) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as err:
            raise EnableBankingError(err.code, err.read().decode(errors="replace")) from err

    def max_consent_seconds(self) -> int:
        """How long the configured ASPSP lets a consent last, from its own
        /aspsps entry; falls back to 90 days if it isn't listed."""
        aspsps = self._request("GET", "/aspsps", params={"country": ASPSP_COUNTRY}).get("aspsps", [])
        match = next((a for a in aspsps if a.get("name") == ASPSP_NAME), None)
        return int((match or {}).get("maximum_consent_validity") or DEFAULT_CONSENT_SECONDS)

    def start_auth(self, state: str, valid_until_iso: str) -> str:
        """Starts a consent at the bank. Returns the URL to send the user to."""
        body = {
            "access": {"valid_until": valid_until_iso},
            "aspsp": {"name": ASPSP_NAME, "country": ASPSP_COUNTRY},
            "state": state,
            "redirect_url": REDIRECT_URL,
            "psu_type": "personal",
        }
        return self._request("POST", "/auth", body=body)["url"]

    def create_session(self, code: str) -> dict:
        """Exchanges the ?code= from the bank's redirect for a session:
        {session_id, accounts: [...], access: {valid_until, ...}, ...}."""
        return self._request("POST", "/sessions", body={"code": code})

    def iter_transactions(self, account_uid: str, date_from: str | None = None) -> Iterator[dict]:
        """Yields every transaction for an account, following
        continuation_key pages (Revolut returns 50 per page)."""
        params: dict[str, str] = {"date_from": date_from} if date_from else {}
        while True:
            page = self._request("GET", f"/accounts/{account_uid}/transactions", params=params)
            yield from page.get("transactions", [])
            key = page.get("continuation_key")
            if not key:
                return
            params = {**params, "continuation_key": key}
