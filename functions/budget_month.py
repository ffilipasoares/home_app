"""Decides which budget month a transaction counts toward — independent
of its calendar date (see schema.py's Transaction.month). One rule today:
a salary paid in the last week of a month is next month's income, a
common payroll-timing pattern (paid a few days early).

This is deterministic code, not the categorization agent's judgment —
the user specified the exact rule (last week of the month -> next
month), so implementing that rule as code is following it precisely,
not a substitute for asking the agent to decide something open-ended.
Flagging this choice rather than making it silently: if what was
actually wanted is the agent itself reasoning about "is this late enough
to be next month's," that's a different, judgment-based design — say so
and it'll change.
"""

import calendar

LATE_MONTH_THRESHOLD_DAYS = 7


def resolve_budget_month(iso_date: str, calendar_month: str, category_special: str | None) -> str:
    """`iso_date` is the transaction's real date (YYYY-MM-DD);
    `calendar_month` is its YYYY-MM (normally iso_date's own month, but
    already-moved transactions keep whatever a human last set — see the
    call sites in main.py for when this runs at all). Returns the budget
    month this transaction should count toward. Only ever shifts a
    transaction in the "income" special category — this rule has no
    opinion about a regular expense.
    """
    if category_special != "income":
        return calendar_month

    year, month, day = (int(p) for p in iso_date.split("-"))
    days_in_month = calendar.monthrange(year, month)[1]
    if day <= days_in_month - LATE_MONTH_THRESHOLD_DAYS:
        return calendar_month

    next_year, next_month = (year + 1, 1) if month == 12 else (year, month + 1)
    return f"{next_year:04d}-{next_month:02d}"
