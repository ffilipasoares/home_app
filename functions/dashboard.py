"""Recomputes users/{uid}/dashboards/{month} from scratch: transactions for
the month, plus that month's own income record (monthlyIncome/{month} — a
per-month value on purpose, so recomputing October never changes what
August's dashboard says), plus the global fixed-expenses/savings-goal
settings. Always a full re-sum rather than an incremental +/- — at one
household's transaction volume this is cheap, and it means the result is
correct even if a write is retried or edited repeatedly (see main.py).
"""

import time

from firebase_admin import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

from schema import CategoryDef, DashboardDoc, MonthlyIncome, UserSettings


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
    manual_salary = income_data.get("salary")
    fixed_incomes = income_data.get("fixedIncomes", [])

    auto_detected_salary = 0.0
    savings_actual = 0.0
    total_expenses = 0.0
    needs_review_count = 0
    totals_by_category: dict[str, float] = {}

    for doc in tx_docs:
        tx = doc.to_dict()
        if tx.get("needsReview") or not tx.get("category"):
            needs_review_count += 1
            continue
        definition = category_by_id.get(tx["category"])
        special = definition.get("special") if definition else None
        if special == "income":
            auto_detected_salary += tx["amount"]
            continue
        if special == "savings":
            savings_actual += abs(tx["amount"])
            continue
        spend = abs(min(0.0, tx["amount"]))  # only money out counts as an expense
        if spend == 0:
            continue
        totals_by_category[tx["category"]] = totals_by_category.get(tx["category"], 0.0) + spend
        total_expenses += spend

    # The manual, per-month entry is authoritative when present (it's the
    # number you sat down and confirmed for this specific month) — it
    # doesn't add to the auto-detected figure, it replaces it, so a
    # categorized transaction and a manual entry never double-count.
    salary = manual_salary if manual_salary is not None else auto_detected_salary
    salary_source = "manual" if manual_salary is not None else ("auto" if auto_detected_salary > 0 else "none")

    fixed_expenses_total = sum(item["amount"] for item in fixed_expenses)
    fixed_incomes_total = sum(item["amount"] for item in fixed_incomes)
    total_income = salary + fixed_incomes_total

    if savings_goal["type"] == "fixed":
        savings_goal_target = savings_goal["value"]
    else:
        savings_goal_target = (savings_goal["value"] / 100) * total_income

    # Money left is what's actually left — income minus real spend — not
    # further reduced by the savings goal, which is a target compared
    # against via savings_actual/savings_goal_target, not a guaranteed
    # outflow.
    money_left = total_income - total_expenses - fixed_expenses_total

    dashboard: DashboardDoc = {
        "month": month,
        "salary": salary,
        "autoDetectedSalary": auto_detected_salary,
        "salarySource": salary_source,  # type: ignore[typeddict-item]
        "totalsByCategory": totals_by_category,
        "totalExpenses": total_expenses,
        "fixedExpensesTotal": fixed_expenses_total,
        "fixedIncomesTotal": fixed_incomes_total,
        "savingsGoalTarget": savings_goal_target,
        "savingsActual": savings_actual,
        "moneyLeft": money_left,
        "needsReviewCount": needs_review_count,
        "updatedAt": int(time.time() * 1000),
    }

    user_ref.collection("dashboards").document(month).set(dashboard)
