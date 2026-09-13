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
    amount: float  # signed: negative = money out, positive = money in
    currency: str
    merchantRaw: str
    merchantNormalized: str
    category: str | None
    needsReview: bool
    source: Literal["manual-import", "manual-edit", "auto"]
    confidence: float
    accountId: str
    createdAt: int
    updatedAt: int


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
