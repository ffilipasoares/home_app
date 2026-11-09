"""Investments: what each investment account is worth, refreshed by the
twice-daily sync, whenever you edit them in the app, and on demand.

Accounts are listed in users/{uid}/settings/investments (edited in the
app), each of one kind:

- "trading212": read through Trading 212's public API (Invest and Stocks
  ISA accounts only) with a read-only API key and secret you create in the
  Trading 212 app. The key is stored in bankSecrets/{uid} (never readable
  by the app) and never returned.
- "holdings": shares you keep up to date by hand (Degiro, Google stock at
  Schwab): a symbol and a quantity each; prices are looked up here.
- "cash": a balance you type in (the Trading 212 Cash ISA, which the API
  doesn't cover).

No broker password is ever stored (decided by the user). The result goes
to users/{uid}/investments/current, and a copy of the totals to
users/{uid}/investmentHistory/{YYYY-MM-DD} (one per day, the last refresh
wins) for the value-over-time chart.

Prices come from Yahoo Finance's public chart endpoint (no key). If a price
can't be fetched, the last known one is kept and the holding is marked
stale, so a hiccup never zeroes an account.
"""

import base64
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

from firebase_admin import firestore

from fx import DISPLAY_CURRENCIES, get_rate

T212_BASE = "https://live.trading212.com/api/v0"
_YAHOO = "https://query1.finance.yahoo.com"
_TIMEOUT_SECONDS = 15
# Some endpoints turn away urllib's default user agent.
_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; home-finance-app/1.0)", "Accept": "application/json"}


class InvestmentError(Exception):
    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


def _get_json(url: str, headers: dict | None = None) -> dict:
    req = urllib.request.Request(url, headers={**_HEADERS, **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT_SECONDS) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as err:
        raise InvestmentError(f"HTTP {err.code}", err.code) from err
    except (urllib.error.URLError, TimeoutError, ValueError) as err:
        raise InvestmentError(str(err)) from err


# --- Trading 212 ---------------------------------------------------------------


def _t212_get(path: str, key: str, secret: str) -> dict | list:
    token = base64.b64encode(f"{key}:{secret}".encode()).decode()
    return _get_json(f"{T212_BASE}{path}", {"Authorization": f"Basic {token}"})


def fetch_trading212(key: str, secret: str) -> dict:
    """One Trading 212 account: {currency, value, gain, cash, holdings},
    all in the account's own currency."""
    summary = _t212_get("/equity/account/summary", key, secret)
    positions = _t212_get("/equity/positions", key, secret)
    currency = summary.get("currency") or "GBP"
    cash = summary.get("cash") or {}
    investments = summary.get("investments") or {}
    holdings = []
    for p in positions if isinstance(positions, list) else []:
        instrument = p.get("instrument") or {}
        impact = p.get("walletImpact") or {}
        price, price_currency = _normalize_price(float(p.get("currentPrice") or 0), instrument.get("currency") or currency)
        holdings.append(
            {
                "symbol": instrument.get("ticker") or "",
                "isin": instrument.get("isin") or "",
                "name": instrument.get("name") or instrument.get("ticker") or "",
                "quantity": float(p.get("quantity") or 0),
                "price": price,
                "priceCurrency": price_currency,
                # Value and cost in the account's currency (fx included).
                "value": float(impact.get("currentValue") or 0),
                "invested": float(impact.get("totalCost") or 0),
            }
        )
    holdings.sort(key=lambda h: -h["value"])
    cash_total = sum(float(cash.get(k) or 0) for k in ("availableToTrade", "reservedForOrders", "inPies"))
    return {
        "currency": currency,
        "value": float(summary.get("totalValue") or (float(investments.get("currentValue") or 0) + cash_total)),
        "gain": float(investments.get("unrealizedProfitLoss") or 0),
        "cash": cash_total,
        "holdings": holdings,
    }


# --- Prices --------------------------------------------------------------------


def _normalize_price(price: float, currency: str) -> tuple[float, str]:
    # London listings are quoted in pence.
    if currency in ("GBp", "GBX"):
        return price / 100, "GBP"
    return price, currency.upper()


def quote(symbol: str) -> dict:
    """{symbol, name, price, currency} for a Yahoo Finance symbol (GOOGL,
    VWCE.DE, VUSA.L…)."""
    data = _get_json(f"{_YAHOO}/v8/finance/chart/{urllib.parse.quote(symbol)}?range=1d&interval=1d")
    results = (data.get("chart") or {}).get("result") or []
    if not results:
        raise InvestmentError(f"No price for {symbol}")
    meta = results[0].get("meta") or {}
    if meta.get("regularMarketPrice") is None or not meta.get("currency"):
        raise InvestmentError(f"No price for {symbol}")
    price, currency = _normalize_price(float(meta["regularMarketPrice"]), meta["currency"])
    return {
        "symbol": meta.get("symbol") or symbol,
        "name": meta.get("longName") or meta.get("shortName") or symbol,
        "price": price,
        "currency": currency,
    }


def search_symbols(query: str, limit: int = 6) -> list[dict]:
    """Shares and funds matching a name, ticker or ISIN, for picking a
    holding's symbol: [{symbol, name, exchange, type}]."""
    params = urllib.parse.urlencode({"q": query, "quotesCount": limit, "newsCount": 0})
    data = _get_json(f"{_YAHOO}/v1/finance/search?{params}")
    found = []
    for q in data.get("quotes") or []:
        if q.get("quoteType") not in ("EQUITY", "ETF", "MUTUALFUND", "INDEX"):
            continue
        found.append(
            {
                "symbol": q.get("symbol"),
                "name": q.get("longname") or q.get("shortname") or q.get("symbol"),
                "exchange": q.get("exchDisp") or q.get("exchange") or "",
                "type": q.get("quoteType"),
            }
        )
    return found[:limit]


# How far back each chart range goes, and how often a point.
HISTORY_RANGES = {"1d": "5m", "1mo": "1d", "6mo": "1d", "1y": "1d", "5y": "1wk"}

# Trading 212 tickers ("AAPL_US_EQ", "VUSAl_EQ") -> Yahoo exchange suffixes.
_T212_SUFFIX = {"l": ".L", "d": ".DE", "a": ".AS", "p": ".PA", "m": ".MI", "e": ".MC", "s": ".SW", "b": ".BR"}


def _t212_guess(ticker: str) -> str | None:
    if not ticker.endswith("_EQ"):
        return None
    base = ticker[: -len("_EQ")]
    if base.endswith("_US"):
        return base[: -len("_US")].replace(".", "-")  # BRK.B -> BRK-B
    if len(base) > 1 and base[-1] in _T212_SUFFIX and base[:-1].isupper():
        return base[:-1] + _T212_SUFFIX[base[-1]]
    return None


def price_history(symbol: str, range_: str, isin: str = "", name: str = "") -> dict:
    """Prices for a holding's chart: {symbol, name, currency, points: [{t, price}]}
    with t in ms. `symbol` can be a Yahoo symbol or a Trading 212 ticker; a
    ticker that can't be read is looked up by ISIN, then by name."""
    if range_ not in HISTORY_RANGES:
        raise InvestmentError(f"Unknown range {range_}")
    candidates = [s for s in (_t212_guess(symbol), None if symbol.endswith("_EQ") else symbol) if s]
    last_error: InvestmentError | None = None
    for attempt in range(2):
        for candidate in candidates:
            try:
                return _chart(candidate, range_)
            except InvestmentError as err:
                last_error = err
        if attempt == 0:
            found = []
            for q in (isin, name):
                if q and not found:
                    try:
                        found = search_symbols(q, 1)
                    except InvestmentError:
                        pass
            candidates = [found[0]["symbol"]] if found else []
    raise last_error or InvestmentError(f"No prices for {symbol}")


def _chart(symbol: str, range_: str) -> dict:
    params = urllib.parse.urlencode({"range": range_, "interval": HISTORY_RANGES[range_]})
    data = _get_json(f"{_YAHOO}/v8/finance/chart/{urllib.parse.quote(symbol)}?{params}")
    results = (data.get("chart") or {}).get("result") or []
    if not results:
        raise InvestmentError(f"No prices for {symbol}")
    result = results[0]
    meta = result.get("meta") or {}
    closes = (((result.get("indicators") or {}).get("quote") or [{}])[0] or {}).get("close") or []
    raw_currency = meta.get("currency") or ""
    points = []
    for t, close in zip(result.get("timestamp") or [], closes):
        if close is None:
            continue
        price, _ = _normalize_price(float(close), raw_currency)
        points.append({"t": int(t) * 1000, "price": price})
    if not points:
        raise InvestmentError(f"No prices for {symbol}")
    _, currency = _normalize_price(0.0, raw_currency)
    return {"symbol": meta.get("symbol") or symbol, "name": meta.get("longName") or meta.get("shortName") or symbol,
            "currency": currency, "points": points}


# --- Refresh -------------------------------------------------------------------


def _lisbon_today() -> str:
    return datetime.now(ZoneInfo("Europe/Lisbon")).strftime("%Y-%m-%d")


def _in_display(amount: float, currency: str, on_date: str) -> dict[str, float] | None:
    """`amount` in every display currency, or None if a rate is missing."""
    out = {}
    for target in DISPLAY_CURRENCIES:
        rate = get_rate(currency, target, on_date)
        if rate is None:
            return None
        out[target] = amount * rate
    return out


def _add(total: dict[str, float], part: dict[str, float] | None) -> None:
    for k, v in (part or {}).items():
        total[k] = total.get(k, 0.0) + v


def _holdings_account(account: dict, previous: dict, today: str) -> dict:
    """A hand-kept account: each holding priced now (or at its last known
    price, marked stale)."""
    old_prices = {h.get("symbol"): h for h in previous.get("holdings") or []}
    holdings, value_in, gain_in = [], {}, {}
    errors = []
    has_gain = False
    for h in account.get("holdings") or []:
        symbol = (h.get("symbol") or "").strip()
        quantity = float(h.get("quantity") or 0)
        if not symbol:
            continue
        try:
            q = quote(symbol)
            price, currency, name, stale = q["price"], q["currency"], h.get("name") or q["name"], False
        except InvestmentError as err:
            old = old_prices.get(symbol)
            if not old or old.get("price") is None:
                errors.append(f"{symbol}: {err}")
                holdings.append({"id": h.get("id"), "symbol": symbol, "name": h.get("name") or symbol,
                                 "quantity": quantity, "price": None, "currency": None, "value": None,
                                 "valueIn": None, "investedIn": None, "stale": True})
                continue
            price, currency, name, stale = old["price"], old["currency"], h.get("name") or old.get("name") or symbol, True
        value = price * quantity
        h_value_in = _in_display(value, currency, today)
        invested = h.get("invested")
        h_invested_in = _in_display(float(invested), currency, today) if invested not in (None, "") else None
        if h_invested_in is not None and h_value_in is not None:
            has_gain = True
            _add(gain_in, {k: h_value_in[k] - h_invested_in[k] for k in h_value_in})
        holdings.append({"id": h.get("id"), "symbol": symbol, "name": name, "quantity": quantity, "price": price,
                         "currency": currency, "value": value, "valueIn": h_value_in,
                         "investedIn": h_invested_in, "stale": stale})
        _add(value_in, h_value_in)
    holdings.sort(key=lambda h: -(h["valueIn"] or {}).get("EUR", 0))
    # Gain counts only the holdings you gave an amount invested for.
    return {"valueIn": value_in, "gainIn": gain_in if has_gain else None, "holdings": holdings,
            "error": "; ".join(errors) or None}


def _trading212_account(keys: dict | None, previous: dict, today: str, fetched: dict | None = None) -> dict:
    if not keys:
        return {"valueIn": {}, "gainIn": None, "holdings": [], "connected": False, "error": None}
    try:
        acc = fetched or fetch_trading212(keys["key"], keys["secret"])
    except InvestmentError as err:
        if err.status in (401, 403):
            message = "Trading 212 no longer accepts the API key: create a new one and connect again."
        elif err.status == 429:
            message = None  # asked too soon after the last refresh: the last values are fine
        else:
            message = f"Couldn't reach Trading 212 ({err}). Showing the last values."
        # Keep the last known values rather than showing 0.
        return {**{k: previous.get(k) for k in ("valueIn", "gainIn", "holdings", "cashIn")},
                "connected": True, "error": message, "stale": True}
    currency = acc["currency"]
    holdings = [
        {**h, "currency": currency, "valueIn": _in_display(h["value"], currency, today),
         "investedIn": _in_display(h["invested"], currency, today)}
        for h in acc["holdings"]
    ]
    return {"valueIn": _in_display(acc["value"], currency, today) or {},
            "gainIn": _in_display(acc["gain"], currency, today),
            "cashIn": _in_display(acc["cash"], currency, today),
            "holdings": holdings, "connected": True, "error": None, "stale": False}


def refresh_investments(uid: str, fetched: dict[str, dict] | None = None) -> dict | None:
    """Values every investment account and saves the result. Returns the
    saved doc, or None if no investment accounts are set up. `fetched`:
    Trading 212 accounts just read (by account id), so they aren't asked
    again within their rate limit."""
    db = firestore.client()
    user_ref = db.collection("users").document(uid)
    settings = (user_ref.collection("settings").document("investments").get().to_dict() or {})
    accounts = settings.get("accounts") or []
    if not accounts:
        return None
    keys = (db.collection("bankSecrets").document(uid).get().to_dict() or {}).get("trading212Keys") or {}
    current_ref = user_ref.collection("investments").document("current")
    previous = {a["id"]: a for a in (current_ref.get().to_dict() or {}).get("accounts") or [] if a.get("id")}
    today = _lisbon_today()

    results, total_in, gain_total = [], {}, {}
    for account in accounts:
        kind, prev = account.get("kind"), previous.get(account.get("id"), {})
        if kind == "trading212":
            result = _trading212_account(keys.get(account["id"]), prev, today, (fetched or {}).get(account["id"]))
        elif kind == "holdings":
            result = _holdings_account(account, prev, today)
        elif kind == "cash":
            balance = float(account.get("balance") or 0)
            result = {"valueIn": _in_display(balance, account.get("currency") or "GBP", today) or {},
                      "gainIn": None, "holdings": [], "error": None}
        else:
            continue
        results.append({"id": account["id"], "label": account.get("label") or account["id"], "kind": kind, **result})
        _add(total_in, result.get("valueIn"))
        _add(gain_total, result.get("gainIn"))

    doc = {"accounts": results, "totalIn": total_in, "gainIn": gain_total or None,
           "date": today, "updatedAt": int(time.time() * 1000)}
    current_ref.set(doc)
    user_ref.collection("investmentHistory").document(today).set(
        {"date": today, "totalIn": total_in, "accounts": {a["id"]: a.get("valueIn") or {} for a in results}}
    )
    return doc
