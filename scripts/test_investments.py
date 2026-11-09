#!/usr/bin/env python3
"""Offline test of the Investments tab's backend (functions/investments.py):
Trading 212 accounts read through the API, hand-kept holdings priced from
Yahoo, a cash balance, totals in EUR and GBP, gain, the daily history, and
what happens when a price or Trading 212 can't be reached. No network, no
credentials: HTTP, rates and Firestore are stubbed.

Run:
    cd functions && source venv/bin/activate && cd ..
    python3 scripts/test_investments.py
"""

import base64
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "functions"))

import investments  # noqa: E402

failures = 0


def check(label, cond):
    global failures
    print(("PASS " if cond else "FAIL ") + label)
    failures += 0 if cond else 1


# --- Minimal in-memory Firestore -------------------------------------------
class Snap:
    def __init__(self, data):
        self._data = data

    def to_dict(self):
        return None if self._data is None else dict(self._data)


class DocRef:
    def __init__(self, db, path):
        self.db, self.path = db, path

    def collection(self, name):
        return ColRef(self.db, f"{self.path}/{name}")

    def get(self):
        return Snap(self.db.store.get(self.path))

    def set(self, data):
        self.db.store[self.path] = dict(data)


class ColRef:
    def __init__(self, db, path):
        self.db, self.path = db, path

    def document(self, doc_id):
        return DocRef(self.db, f"{self.path}/{doc_id}")


class FakeDB:
    def __init__(self):
        self.store = {}

    def collection(self, name):
        return ColRef(self, name)


db = FakeDB()
investments.firestore.client = lambda: db
investments._lisbon_today = lambda: "2026-11-09"
# Into EUR: GBP 1.2, USD 0.9; into GBP the inverse of GBP's.
RATES = {("GBP", "EUR"): 1.2, ("USD", "EUR"): 0.9, ("EUR", "GBP"): 1 / 1.2, ("USD", "GBP"): 0.75}
investments.get_rate = lambda b, q, d: 1.0 if b == q else RATES[(b, q)]

# --- Stubbed HTTP ----------------------------------------------------------------
calls = []
down = set()  # URL fragments that fail
SUMMARY = {"id": 1, "currency": "GBP", "totalValue": 1100.0,
           "cash": {"availableToTrade": 90.0, "reservedForOrders": 0, "inPies": 10.0},
           "investments": {"currentValue": 1000.0, "totalCost": 900.0, "unrealizedProfitLoss": 100.0}}
POSITIONS = [
    {"instrument": {"ticker": "VUSAl_EQ", "name": "Vanguard S&P 500", "currency": "GBX"}, "quantity": 10,
     "currentPrice": 7000, "walletImpact": {"currency": "GBP", "currentValue": 700.0, "totalCost": 650.0}},
    {"instrument": {"ticker": "AAPL_US_EQ", "name": "Apple", "currency": "USD"}, "quantity": 2,
     "currentPrice": 190, "walletImpact": {"currency": "GBP", "currentValue": 300.0, "totalCost": 250.0}},
]
CHART = {"GOOGL": (180.0, "USD", "Alphabet Inc."), "VWCE.DE": (120.0, "EUR", "Vanguard FTSE All-World"),
         "VUSA.L": (7000.0, "GBp", "Vanguard S&P 500 UCITS ETF")}


def fake_get_json(url, headers=None):
    calls.append((url, headers or {}))
    for frag, status in list(down_status.items()):
        if frag in url:
            raise investments.InvestmentError(f"HTTP {status}", status)
    if any(f in url for f in down):
        raise investments.InvestmentError("down")
    if url.endswith("/equity/account/summary"):
        return SUMMARY
    if url.endswith("/equity/positions"):
        return POSITIONS
    if "/v8/finance/chart/" in url:
        symbol = url.split("/v8/finance/chart/")[1].split("?")[0]
        price, cur, name = CHART[symbol]
        return {"chart": {"result": [{"meta": {"symbol": symbol, "regularMarketPrice": price, "currency": cur, "longName": name}}]}}
    raise AssertionError(url)


down_status = {}
investments._get_json = fake_get_json

# --- Trading 212 reading -----------------------------------------------------------
acc = investments.fetch_trading212("KEY", "SECRET")
auth = calls[0][1]["Authorization"]
check("Trading 212: Basic auth with key:secret", auth == "Basic " + base64.b64encode(b"KEY:SECRET").decode())
check("Trading 212: total, gain and cash from the summary", (acc["value"], acc["gain"], acc["cash"]) == (1100.0, 100.0, 100.0))
check("Trading 212: holdings valued in the account currency, biggest first",
      [h["symbol"] for h in acc["holdings"]] == ["VUSAl_EQ", "AAPL_US_EQ"] and acc["holdings"][0]["value"] == 700.0)
check("Trading 212 pence prices shown in pounds",
      (acc["holdings"][0]["price"], acc["holdings"][0]["priceCurrency"]) == (70.0, "GBP"))
check("London prices in pence become pounds", investments.quote("VUSA.L")["price"] == 70.0 and investments.quote("VUSA.L")["currency"] == "GBP")

# --- A full refresh --------------------------------------------------------------------
U = "users/u1"
check("no accounts set up: nothing saved", investments.refresh_investments("u1") is None and f"{U}/investments/current" not in db.store)
db.store[f"{U}/settings/investments"] = {"accounts": [
    {"id": "t212-isa", "label": "Trading 212 Stocks ISA", "kind": "trading212"},
    {"id": "t212-cash", "label": "Trading 212 Cash ISA", "kind": "cash", "currency": "GBP", "balance": 5000},
    {"id": "degiro", "label": "Degiro", "kind": "holdings",
     "holdings": [{"id": "h1", "symbol": "VWCE.DE", "quantity": 10, "invested": 1000}]},
    {"id": "schwab", "label": "Google (Schwab)", "kind": "holdings",
     "holdings": [{"id": "h2", "symbol": "GOOGL", "quantity": 20}]},
]}
db.store["bankSecrets/u1"] = {"trading212Keys": {"t212-isa": {"key": "T212-KEY-XYZ", "secret": "T212-SECRET-XYZ"}}}
doc = investments.refresh_investments("u1")
by = {a["id"]: a for a in doc["accounts"]}
check("Trading 212 Stocks ISA in EUR and GBP", by["t212-isa"]["valueIn"] == {"EUR": 1100.0 * 1.2, "GBP": 1100.0})
check("Cash ISA balance converted", by["t212-cash"]["valueIn"] == {"EUR": 6000.0, "GBP": 5000.0})
check("Degiro holding priced: 10 × €120", by["degiro"]["valueIn"]["EUR"] == 1200.0)
check("Google shares priced in USD and converted: 20 × $180", by["schwab"]["valueIn"]["EUR"] == 20 * 180 * 0.9)
check("total adds every account",
      abs(doc["totalIn"]["EUR"] - (1320.0 + 6000.0 + 1200.0 + 3240.0)) < 1e-9)
check("gain: Trading 212's own, plus holdings with an amount invested only",
      abs(doc["gainIn"]["EUR"] - (100.0 * 1.2 + 200.0)) < 1e-9 and by["schwab"]["gainIn"] is None)
check("history kept for today", db.store[f"{U}/investmentHistory/2026-11-09"]["totalIn"] == doc["totalIn"])
check("the API key is never in what the app reads", "XYZ" not in str(db.store[f"{U}/investments/current"]))

# --- When things can't be reached ------------------------------------------------------------
down.add("VWCE.DE")
doc = investments.refresh_investments("u1")
deg = next(a for a in doc["accounts"] if a["id"] == "degiro")
check("price down: last price kept, marked stale", deg["valueIn"]["EUR"] == 1200.0 and deg["holdings"][0]["stale"] is True)
down.clear()

down_status["/equity/account/summary"] = 401
doc = investments.refresh_investments("u1")
isa = next(a for a in doc["accounts"] if a["id"] == "t212-isa")
check("key revoked: says so and keeps the last values", "no longer accepts" in isa["error"] and isa["valueIn"]["GBP"] == 1100.0)
down_status["/equity/account/summary"] = 429
doc = investments.refresh_investments("u1")
isa = next(a for a in doc["accounts"] if a["id"] == "t212-isa")
check("rate-limited: last values, no error shown", isa["error"] is None and isa["valueIn"]["GBP"] == 1100.0)
calls.clear()
investments.refresh_investments("u1", {"t212-isa": acc})
check("values just fetched while connecting are reused, not asked again", not any("trading212" in u for u, _ in calls))
down_status.clear()

db.store["bankSecrets/u1"] = {}
doc = investments.refresh_investments("u1")
isa = next(a for a in doc["accounts"] if a["id"] == "t212-isa")
check("not connected: shown as such, counts 0", isa["connected"] is False and isa["valueIn"] == {})

# --- Price history for a holding's chart ----------------------------------------------
check("Trading 212 tickers read as Yahoo symbols",
      [investments._t212_guess(t) for t in ("AAPL_US_EQ", "BRK.B_US_EQ", "VUSAl_EQ", "VWCEd_EQ", "WEIRD_EQ", "GOOGL")]
      == ["AAPL", "BRK-B", "VUSA.L", "VWCE.DE", None, None])
history_calls = []


def history_json(url, headers=None):
    history_calls.append(url)
    if "/v1/finance/search" in url:
        return {"quotes": [{"symbol": "IUSQ.DE", "longname": "iShares MSCI ACWI", "quoteType": "ETF", "exchDisp": "XETRA"}]}
    symbol = url.split("/v8/finance/chart/")[1].split("?")[0]
    if symbol not in ("IUSQ.DE", "VUSA.L"):
        raise investments.InvestmentError("HTTP 404", 404)
    currency = "GBp" if symbol == "VUSA.L" else "EUR"
    return {"chart": {"result": [{"meta": {"symbol": symbol, "currency": currency, "longName": symbol},
                                  "timestamp": [1700000000, 1700086400, 1700172800],
                                  "indicators": {"quote": [{"close": [7000.0, None, 7100.0]}]}}]}}


investments._get_json = history_json
h = investments.price_history("VUSAl_EQ", "1y")
check("history: pence turned into pounds, gaps skipped, times in ms",
      h["currency"] == "GBP" and [p["price"] for p in h["points"]] == [70.0, 71.0] and h["points"][0]["t"] == 1700000000000)
check("history: daily points for a year", "interval=1d" in history_calls[-1] and "range=1y" in history_calls[-1])
history_calls.clear()
h = investments.price_history("ISACm_EQ", "1mo", isin="IE00B6R52259")
check("history: unknown listing found again by ISIN", h["symbol"] == "IUSQ.DE" and any("search" in u for u in history_calls))
try:
    investments.price_history("GOOGL", "10y")
    check("history: unknown range refused", False)
except investments.InvestmentError:
    check("history: unknown range refused", True)

print("\nALL PASSED" if failures == 0 else f"\n{failures} FAILED")
sys.exit(1 if failures else 0)
