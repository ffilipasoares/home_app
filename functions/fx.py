"""Currency conversion, so the dashboard can show every amount in either
EUR or GBP (DISPLAY_CURRENCIES), whatever account it came from. Uses the
free, keyless Frankfurter API: ECB daily reference rates, no API key, no
account: https://frankfurter.dev/

Each transaction stores its amount in every display currency
(`amountIn`), converted at the rate for its own date, so a GBP purchase
keeps its exact GBP amount in the GBP view and a EUR purchase its exact
EUR amount in the EUR view. Converted amounts are never rounded; only the
app's display shows cents.
"""

import json
import os
import urllib.error
import urllib.request

# The currency salaries, fixed expenses and the savings goal are entered in.
HOME_CURRENCY = os.environ.get("HOME_CURRENCY", "EUR")
# Every currency the dashboard can be viewed in.
DISPLAY_CURRENCIES: tuple[str, ...] = tuple(os.environ.get("DISPLAY_CURRENCIES", "EUR,GBP").split(","))

_TIMEOUT_SECONDS = 10
# (base, quote, date) -> rate. Rates for a past date never change, so a
# warm function instance (or a sync converting hundreds of transactions)
# looks each one up once.
_cache: dict[tuple[str, str, str], float] = {}


def get_rate(base: str, quote: str, on_date: str) -> float | None:
    """The ECB reference rate from `base` to `quote` for `on_date`
    (YYYY-MM-DD), unrounded, or None on any failure. For a weekend or
    holiday Frankfurter returns the last published rate before that date."""
    if base == quote:
        return 1.0
    key = (base, quote, on_date)
    if key in _cache:
        return _cache[key]
    url = f"https://api.frankfurter.dev/v1/{on_date}?base={base}&symbols={quote}"
    # Some API front-ends reject urllib's default "Python-urllib" user agent.
    req = urllib.request.Request(url, headers={"User-Agent": "home-finance-app/1.0", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT_SECONDS) as resp:
            rate = float(json.loads(resp.read())["rates"][quote])
    except (urllib.error.URLError, KeyError, ValueError, TimeoutError) as err:
        print(f"get_rate failed for {base}->{quote} on {on_date}: {err}")
        return None
    _cache[key] = rate
    return rate


def amounts_in(amount: float, currency: str, on_date: str, known: dict[str, float] | None = None) -> dict[str, float]:
    """`amount` (in `currency`) expressed in every display currency, at the
    rate for `on_date`. Its own currency is always included as-is. A
    currency whose rate lookup fails is left out (callers retry later);
    any already in `known` is kept rather than looked up again."""
    result = dict(known or {})
    result[currency] = amount
    for target in DISPLAY_CURRENCIES:
        if target not in result:
            rate = get_rate(currency, target, on_date)
            if rate is not None:
                result[target] = amount * rate
    return result


def missing_display_currencies(tx: dict) -> list[str]:
    """Display currencies a transaction has no amount for yet."""
    have = set((tx.get("amountIn") or {}).keys()) | {tx.get("currency", HOME_CURRENCY)}
    return [c for c in DISPLAY_CURRENCIES if c not in have]


def amount_in(tx: dict, currency: str) -> float | None:
    """A transaction's amount in `currency`, or None if not converted yet.
    Also reads `amountHome` (EUR), written by versions before amountIn."""
    if tx.get("currency", HOME_CURRENCY) == currency:
        return tx["amount"]
    value = (tx.get("amountIn") or {}).get(currency)
    if value is None and currency == "EUR":
        value = tx.get("amountHome")
    return value
