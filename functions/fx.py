"""Currency conversion for merging a multi-currency account (e.g. a
Revolut login's EUR and GBP pockets) into one home currency for the
dashboard math. Uses the free, keyless Frankfurter API — ECB daily
reference rates, no API key, no account: https://frankfurter.dev/

This module is the conversion primitive; it doesn't decide *when* to
convert or what to do with a failure — that's the caller's job (see
dashboard.py's recompute_month for the "same-currency needs no
conversion at all" fallback, and the daily bank-sync job, once built,
for where a genuinely foreign-currency transaction gets its amountHome
computed and persisted at write time).
"""

import json
import os
import urllib.error
import urllib.request

HOME_CURRENCY = os.environ.get("HOME_CURRENCY", "EUR")

_TIMEOUT_SECONDS = 10


def convert_to_home_currency(amount: float, currency: str, on_date: str) -> float | None:
    """Converts `amount` in `currency` to HOME_CURRENCY using the ECB
    daily reference rate for `on_date` (YYYY-MM-DD — the transaction's own
    date, not today, so a purchase keeps the rate that actually applied).
    Returns `amount` unchanged, with no network call, if already in the
    home currency. Returns `None` on any failure — never a guessed or
    stale rate silently passed off as a real conversion; the caller
    should treat `None` the same as "needs review", not as zero.
    """
    if currency == HOME_CURRENCY:
        return amount
    rate = rate_to_home_currency(currency, on_date)
    return None if rate is None else round(amount * rate, 2)


def rate_to_home_currency(currency: str, on_date: str) -> float | None:
    """The unrounded ECB rate from `currency` to HOME_CURRENCY for
    `on_date`, or None on any failure. For a weekend or holiday,
    Frankfurter returns the last published rate before that date. Callers
    converting many transactions (the bank sync) fetch this once per
    currency and date and reuse it."""
    if currency == HOME_CURRENCY:
        return 1.0
    url = f"https://api.frankfurter.dev/v1/{on_date}?base={currency}&symbols={HOME_CURRENCY}"
    # Some API front-ends reject urllib's default "Python-urllib" user agent.
    req = urllib.request.Request(url, headers={"User-Agent": "home-finance-app/1.0", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT_SECONDS) as resp:
            data = json.loads(resp.read())
        return float(data["rates"][HOME_CURRENCY])
    except (urllib.error.URLError, KeyError, ValueError, TimeoutError) as err:
        print(f"rate_to_home_currency failed for {currency}->{HOME_CURRENCY} on {on_date}: {err}")
        return None
