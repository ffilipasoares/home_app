"""Recomputes users/{uid}/dashboards/{month} from scratch: transactions for
the month, plus that month's own income record (monthlyIncome/{month} — a
per-month value on purpose, so recomputing October never changes what
August's dashboard says), plus the global fixed-expenses/savings-goal
settings. Always a full re-sum rather than an incremental +/- — at one
household's transaction volume this is cheap, and it means the result is
correct even if a write is retried or edited repeatedly (see main.py).

Every figure is computed once per display currency (fx.DISPLAY_CURRENCIES:
EUR and GBP) into `views`, so the app can switch between them. Each
transaction contributes its own amount in that currency (`amountIn`,
converted at the rate for its date, unrounded), so a GBP purchase is exact
in the GBP view and a EUR purchase exact in the EUR view. Values entered
by hand (salaries, fixed expenses, savings goal) are in HOME_CURRENCY and
are converted at one rate for the month: the last day of the month, or
today for the current month. A transaction not converted into a currency
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
    manual_filipa_salary = income_data.get("filipaSalary")
    joao_salary = income_data.get("joaoSalary") or 0.0

    rate_date = _month_rate_date(month)
    counted = []
    needs_review_count = 0
    for doc in tx_docs:
        tx = doc.to_dict()
        # Money moved between the user's own accounts is neither spending
        # nor income (see bank_sync.py).
        if tx.get("internalTransfer"):
            continue
        if tx.get("needsReview") or not tx.get("category"):
            needs_review_count += 1
            continue
        counted.append(tx)

    views: dict[str, DashboardView] = {}
    for currency in DISPLAY_CURRENCIES:
        # HOME_CURRENCY -> this currency, for the hand-entered values.
        manual_rate = get_rate(HOME_CURRENCY, currency, rate_date)
        views[currency] = _view(
            currency,
            counted,
            category_by_id,
            manual_rate,
            rate_date,
            manual_filipa_salary,
            joao_salary,
            fixed_expenses,
            savings_goal,
        )

    home = views[HOME_CURRENCY]
    dashboard: DashboardDoc = {
        "month": month,
        "needsReviewCount": needs_review_count,
        "views": views,
        # The home-currency view again at the top level, as before views
        # existed, for any older copy of the app still cached on a device.
        **{k: v for k, v in home.items() if k not in ("currency", "manualRate", "manualRateDate")},  # type: ignore[typeddict-item]
        "updatedAt": int(time.time() * 1000),
    }
    user_ref.collection("dashboards").document(month).set(dashboard)


def _view(
    currency: str,
    transactions: list[dict],
    category_by_id: dict[str, CategoryDef],
    manual_rate: float | None,
    rate_date: str,
    manual_filipa_salary: float | None,
    joao_salary: float,
    fixed_expenses: list,
    savings_goal: dict,
) -> DashboardView:
    auto_detected_salary = 0.0
    savings_actual = 0.0
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
            savings_actual += abs(amount)
            continue
        spend = abs(min(0.0, amount))  # only money out counts as an expense
        if spend == 0:
            continue
        totals_by_category[tx["category"]] = totals_by_category.get(tx["category"], 0.0) + spend
        total_expenses += spend

    # Hand-entered values are in HOME_CURRENCY. If this month's rate can't
    # be looked up right now they count as 0 in this view, and
    # manualRate=None lets the app say so.
    convert = (lambda v: v * manual_rate) if manual_rate is not None else (lambda v: 0.0)

    # The manual, per-month entry is authoritative when present (it's the
    # number you sat down and confirmed for this specific month) — it
    # doesn't add to the auto-detected figure, it replaces it, so a
    # categorized transaction and a manual entry never double-count.
    filipa_salary = convert(manual_filipa_salary) if manual_filipa_salary is not None else auto_detected_salary
    filipa_salary_source = "manual" if manual_filipa_salary is not None else ("auto" if auto_detected_salary > 0 else "none")

    fixed_expenses_total = convert(sum(item["amount"] for item in fixed_expenses))
    joao = convert(joao_salary)
    total_income = filipa_salary + joao

    if savings_goal["type"] == "fixed":
        savings_goal_target = convert(savings_goal["value"])
    else:
        savings_goal_target = (savings_goal["value"] / 100) * total_income

    # Money left is what's actually left — income minus real spend — not
    # further reduced by the savings goal, which is a target compared
    # against via savings_actual/savings_goal_target, not a guaranteed
    # outflow.
    money_left = total_income - total_expenses - fixed_expenses_total

    return {
        "currency": currency,
        "filipaSalary": filipa_salary,
        "autoDetectedFilipaSalary": auto_detected_salary,
        "filipaSalarySource": filipa_salary_source,  # type: ignore[typeddict-item]
        "joaoSalary": joao,
        "totalsByCategory": totals_by_category,
        "totalExpenses": total_expenses,
        "fixedExpensesTotal": fixed_expenses_total,
        "savingsGoalTarget": savings_goal_target,
        "savingsActual": savings_actual,
        "moneyLeft": money_left,
        "unconvertedCount": unconverted_count,
        "manualRate": manual_rate,
        "manualRateDate": rate_date,
    }
