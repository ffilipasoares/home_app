"""Python mirrors of the Firestore schema described in docs/ARCHITECTURE.md
§6 — keep this in sync with app/src/types.ts (the frontend's own copy) if
either changes; there's no shared package between the TypeScript PWA and
this Python backend.
"""

from typing import Literal, NotRequired, TypedDict


class CategoryDef(TypedDict):
    id: str
    label: str
    # Income and savings-transfer categories are excluded from
    # totalsByCategory/totalExpenses — they feed the salary figure /
    # savings-goal progress instead.
    special: NotRequired[Literal["income", "savings"]]


class FixedLineItem(TypedDict):
    id: str
    label: str
    amount: float


class SavingsGoal(TypedDict):
    type: Literal["fixed", "percent"]
    value: float


class UserSettings(TypedDict):
    savingsGoal: SavingsGoal
    fixedExpenses: list[FixedLineItem]


class MonthlyIncome(TypedDict):
    salary: float | None
    fixedIncomes: list[FixedLineItem]


class CategoryRule(TypedDict):
    merchantNormalized: str
    category: str
    timesConfirmed: int
    lastUpdated: int


class Transaction(TypedDict, total=False):
    id: str
    date: str
    month: str  # YYYY-MM — the budget month, independently editable from date
    amount: float  # signed: negative = money out, positive = money in, in `currency`
    currency: str
    # amount converted to HOME_CURRENCY (fx.py) — this is what dashboard
    # totals actually sum, so a multi-currency account merges into one
    # figure. Absent means "not converted yet"; dashboard.py's fallback
    # (§ recompute_month) treats a same-currency transaction as already
    # converted (amount == amountHome) without needing this field set at
    # all — it's only ever persisted for a genuinely foreign-currency one,
    # written by whatever created the transaction (the daily bank-sync job,
    # once built).
    amountHome: float
    merchantRaw: str
    merchantNormalized: str
    category: str | None
    needsReview: bool
    source: Literal["manual-import", "manual-edit", "auto"]
    confidence: float
    accountId: str
    createdAt: int
    updatedAt: int


class AccountLink(TypedDict, total=False):
    """A linked bank connection (users/{uid}/accounts/{accountId}) — one
    doc per currency pocket/account the aggregator returns under a single
    consent (e.g. a Revolut login with EUR and GBP pockets is two docs,
    one consent). Unused until Phase 2's bank-sync step actually creates
    these; defined now so the shape exists before the code that
    populates it does.
    """

    provider: str  # e.g. "enablebanking"
    displayName: str  # e.g. "Revolut EUR", for Settings' account list
    currency: str
    lastSyncCursor: str | None
    consentExpiresAt: int | None


class DashboardDoc(TypedDict):
    month: str
    salary: float
    autoDetectedSalary: float
    salarySource: Literal["manual", "auto", "none"]
    totalsByCategory: dict[str, float]
    totalExpenses: float
    fixedExpensesTotal: float
    fixedIncomesTotal: float
    savingsGoalTarget: float
    savingsActual: float
    moneyLeft: float
    needsReviewCount: int
    updatedAt: int
