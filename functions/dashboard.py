"""Recomputes users/{uid}/dashboards/{month} from scratch: transactions for
the month (Filipa's salary detected from them), plus the settings: salaries
typed in Settings, fixed expenses and the savings goal (and, for João's
salary when it isn't set, the month's older monthlyIncome/{month} entry). Always a full re-sum rather than an incremental +/- — at one
household's transaction volume this is cheap, and it means the result is
correct even if a write is retried or edited repeatedly (see main.py).

Every figure is computed once per display currency (fx.DISPLAY_CURRENCIES:
EUR and GBP) into `views`, so the app can switch between them. Each
transaction contributes its own amount in that currency (`amountIn`,
converted at the rate for its date, unrounded), so a GBP purchase is exact
in the GBP view and a EUR purchase exact in the EUR view. Values entered
by hand (salaries, fixed expenses, savings goal) each carry their own
currency (salaries: the salary currency in Settings; EUR if not set) and are converted into the other at one rate
for the month: the last day of the month, or today for the current month. A transaction not converted into a currency
yet is left out of that currency's totals and counted in its
`unconvertedCount` (main.py fills the amount in).
"""

import calendar
import time
from datetime import date

from firebase_admin import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

from fx import DISPLAY_CURRENCIES, HOME_CURRENCY, amount_in, get_rate
from schema import CategoryDef, DashboardDoc, DashboardView, MonthlyIncome, UserSettings


# totalsByCategory key for fixed expenses that don't have a category yet.
UNCATEGORIZED_FIXED = "uncategorized_fixed"


def _month_rate_date(month: str) -> str:
    """The date whose rate converts a month's hand-entered values: the
    month's last day, or today if that hasn't happened yet."""
    year, mon = int(month[:4]), int(month[5:7])
    last_day = date(year, mon, calendar.monthrange(year, mon)[1])
    return min(last_day, date.today()).isoformat()


def recompute_month(uid: str, month: str) -> None:
    db = firestore.client()
    user_ref = db.collection("users").document(uid)

    tx_docs = list(
        user_ref.collection("transactions").where(filter=FieldFilter("month", "==", month)).stream()
    )
    categories_snap = user_ref.collection("settings").document("categories").get()
    settings_snap = user_ref.get()
    monthly_income_snap = user_ref.collection("monthlyIncome").document(month).get()

    categories: list[CategoryDef] = (categories_snap.to_dict() or {}).get("categories", [])
    category_by_id = {c["id"]: c for c in categories}

    settings_data: UserSettings = settings_snap.to_dict() or {}  # type: ignore[assignment]
    fixed_expenses = settings_data.get("fixedExpenses", [])
    savings_goal = settings_data.get("savingsGoal", {"type": "fixed", "value": 0})

    income_data: MonthlyIncome = monthly_income_snap.to_dict() or {}  # type: ignore[assignment]
    # Filipa's salary is typed in Settings now (the same every month) or
    # detected; per-month amounts once typed on the Dashboard are no longer used.
    manual_filipa_salary = settings_data.get("filipaSalaryAmount")
    joao_salary = income_data.get("joaoSalary") or 0.0

    rate_date = _month_rate_date(month)
    counted = []
    needs_review_count = 0
    pending_count = 0
    for doc in tx_docs:
        tx = doc.to_dict()
        if tx.get("pending") and not tx.get("internalTransfer"):
            pending_count += 1  # counted in the totals; the app says how many are pending
        # Money moved between the user's own accounts is neither spending
        # nor income (see bank_sync.py).
        if tx.get("internalTransfer"):
            continue
        if tx.get("needsReview") or not tx.get("category"):
            needs_review_count += 1
            continue
        counted.append(tx)

    # Hand-entered values, each as (amount, its own currency). Both salaries
    # are in the salary currency chosen in Settings.
    salary_currency = settings_data.get("salaryCurrency") or HOME_CURRENCY
    filipa_manual = (float(manual_filipa_salary), salary_currency) if manual_filipa_salary is not None else None
    # João's salary is set once in Settings with its own currency; older
    # months may only have a per-month entry, in Filipa's salary currency.
    joao_setting = settings_data.get("joaoSalary")
    if joao_setting and joao_setting.get("amount") is not None:
        joao = (float(joao_setting["amount"]), joao_setting.get("currency") or HOME_CURRENCY)
    else:
        joao = (joao_salary, salary_currency)
    fixed = [
        (item["amount"], item.get("currency") or HOME_CURRENCY, item.get("category"), item.get("label", ""))
        for item in fixed_expenses
    ]

    views: dict[str, DashboardView] = {}
    for currency in DISPLAY_CURRENCIES:
        # Rate from each currency into this one, for the hand-entered values.
        rates = {source: get_rate(source, currency, rate_date) for source in DISPLAY_CURRENCIES}
        views[currency] = _view(
            currency, counted, category_by_id, rates, rate_date, filipa_manual, joao, fixed, savings_goal
        )

    home = views[HOME_CURRENCY]
    dashboard: DashboardDoc = {
        "month": month,
        "needsReviewCount": needs_review_count,
        "pendingCount": pending_count,
        "views": views,
        # The home-currency view again at the top level, as before views
        # existed, for any older copy of the app still cached on a device.
        **{k: v for k, v in home.items() if k not in ("currency", "rates", "rateDate", "missingRate")},  # type: ignore[typeddict-item]
        "updatedAt": int(time.time() * 1000),
    }
    user_ref.collection("dashboards").document(month).set(dashboard)


def _view(
    currency: str,
    transactions: list[dict],
    category_by_id: dict[str, CategoryDef],
    rates: dict[str, float | None],
    rate_date: str,
    filipa_manual: tuple[float, str] | None,
    joao: tuple[float, str],
    fixed: list[tuple[float, str, str | None, str]],
    savings_goal: dict,
) -> DashboardView:
    auto_detected_salary = 0.0
    investments_total = 0.0
    investments: list[dict] = []
    total_expenses = 0.0
    unconverted_count = 0
    totals_by_category: dict[str, float] = {}

    for tx in transactions:
        amount = amount_in(tx, currency)
        if amount is None:
            unconverted_count += 1
            continue
        definition = category_by_id.get(tx["category"])
        special = definition.get("special") if definition else None
        if special == "income":
            auto_detected_salary += amount
            continue
        if special == "savings":
            # Investments are their own thing (decided by the user): shown in
            # the Dashboard's Investments block, never counted as spending,
            # never subtracted from money left, never part of the savings
            # meter. Net: money moved in counts, money taken back subtracts.
            investments_total -= amount
            investments.append(
                {"date": tx.get("date"), "merchant": tx.get("merchantRaw", ""), "amount": -amount, "category": tx["category"]}
            )
            continue
        spend = abs(min(0.0, amount))  # only money out counts as an expense
        if spend == 0:
            continue
        totals_by_category[tx["category"]] = totals_by_category.get(tx["category"], 0.0) + spend
        total_expenses += spend

    # A hand-entered value in another currency whose rate can't be looked
    # up right now counts as 0 in this view; missingRate lets the app say so.
    missing_rate = False

    def convert(amount: float, source: str) -> float:
        nonlocal missing_rate
        if amount == 0:
            return 0.0
        rate = rates.get(source)
        if rate is None:
            missing_rate = True
            return 0.0
        return amount * rate

    # The amount typed in Settings is authoritative when present — it
    # doesn't add to the auto-detected figure, it replaces it, so a
    # categorized transaction and a typed amount never double-count.
    filipa_salary = convert(*filipa_manual) if filipa_manual is not None else auto_detected_salary
    filipa_salary_source = "manual" if filipa_manual is not None else ("auto" if auto_detected_salary > 0 else "none")

    # Fixed expenses count in their category like any spending (a fixed
    # expense still waiting for one under UNCATEGORIZED_FIXED); one in an
    # investments category goes to the Investments block instead.
    fixed_expenses_total = 0.0
    for amount, source, category, label in fixed:
        value = convert(amount, source)
        definition = category_by_id.get(category) if category else None
        if definition and definition.get("special") == "savings":
            investments_total += value
            investments.append({"date": None, "merchant": label, "amount": value, "category": category, "fixed": True})
            continue
        fixed_expenses_total += value
        if value:
            key = category if definition else UNCATEGORIZED_FIXED
            totals_by_category[key] = totals_by_category.get(key, 0.0) + value
    joao_salary = convert(*joao)
    total_income = filipa_salary + joao_salary

    if savings_goal["type"] == "fixed":
        savings_goal_target = convert(savings_goal["value"], savings_goal.get("currency") or HOME_CURRENCY)
    else:
        savings_goal_target = (savings_goal["value"] / 100) * total_income

    # Money left = income minus spending minus fixed expenses (costs paid
    # from another account, e.g. rent, which leave the household's money
    # just the same). Investments are left out entirely. Money left is what
    # you save this month; the savings goal is how much you want it to be,
    # and the Dashboard's savings meter compares the two.
    money_left = total_income - total_expenses - fixed_expenses_total

    return {
        "currency": currency,
        "filipaSalary": filipa_salary,
        "autoDetectedFilipaSalary": auto_detected_salary,
        "filipaSalarySource": filipa_salary_source,  # type: ignore[typeddict-item]
        "joaoSalary": joao_salary,
        "totalsByCategory": totals_by_category,
        "totalExpenses": total_expenses,
        "fixedExpensesTotal": fixed_expenses_total,
        "savingsGoalTarget": savings_goal_target,
        "moneyLeft": money_left,
        "investmentsTotal": investments_total,
        # Monthly fixed investments first, then transactions newest first.
        "investments": sorted(investments, key=lambda i: i["date"] or "9999", reverse=True),
        "unconvertedCount": unconverted_count,
        "rates": rates,
        "rateDate": rate_date,
        "missingRate": missing_rate,
    }
