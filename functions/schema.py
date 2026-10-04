"""Python mirrors of the Firestore schema described in docs/ARCHITECTURE.md
§6 — keep this in sync with app/src/types.ts (the frontend's own copy) if
either changes; there's no shared package between the TypeScript PWA and
this Python backend.
"""

from typing import Literal, NotRequired, TypedDict


class CategoryDef(TypedDict):
    id: str
    label: str
    # "income" categories are excluded from spending and make up the
    # detected salary. "savings" is only a hint for the categorization
    # agent: the dashboard counts it as normal spending.
    special: NotRequired[Literal["income", "savings"]]


class FixedLineItem(TypedDict, total=False):
    id: str
    label: str
    amount: float
    currency: str  # EUR if not set


class SavingsGoal(TypedDict, total=False):
    type: Literal["fixed", "percent"]
    value: float
    currency: str  # for type "fixed"; EUR if not set


class MoneyAmount(TypedDict):
    amount: float
    currency: str


class UserSettings(TypedDict, total=False):
    savingsGoal: SavingsGoal
    fixedExpenses: list[FixedLineItem]
    salaryCurrency: str  # the currency Filipa's salary is paid and entered in; EUR if not set
    # João's salary: the amount and currency he's actually paid, the same
    # every month. When unset, a per-month monthlyIncome.joaoSalary (in
    # salaryCurrency) is used instead, as before.
    joaoSalary: "MoneyAmount | None"
    displayCurrency: str  # which currency the Dashboard shows


class MonthlyIncome(TypedDict):
    # Manual override; null = use the "income"-special-category
    # transaction total detected for the month (see DashboardDoc).
    filipaSalary: float | None
    # Always manual — João's salary never lands in this account, so
    # there's nothing to auto-detect.
    joaoSalary: float | None
    # Filipa's in UserSettings.salaryCurrency. joaoSalary here is only used
    # when UserSettings.joaoSalary isn't set (older per-month entries).


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
    # Amount in every display currency (fx.DISPLAY_CURRENCIES, EUR and
    # GBP), each at the rate for this transaction's date, unrounded; its own
    # currency is included as-is. The dashboard sums these per currency.
    amountIn: dict[str, float]
    # Legacy (before amountIn): amount converted to EUR. Still read as the
    # EUR amount if amountIn has none. Original note: amount converted to HOME_CURRENCY (fx.py) — this is what dashboard
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
    source: Literal["manual-import", "manual-edit", "auto", "bank-sync"]
    confidence: float
    accountId: str  # users/{uid}/accounts/{accountId}, for bank-synced transactions
    externalId: str  # the bank's own entry_reference, for bank-synced transactions
    # A move between the user's own accounts (Revolut EXCHANGE between the
    # EUR and GBP pockets). Never categorized, never counted in any total.
    internalTransfer: bool
    addedManually: bool  # entered by hand on the Transactions page, e.g. paid from another account
    createdAt: int
    updatedAt: int


class AccountLink(TypedDict, total=False):
    """A linked bank account (users/{uid}/accounts/{accountId}), one doc per
    account the bank shares under a consent. A Revolut login's EUR and GBP
    joint accounts are two docs from one consent. Written only by
    bank_sync.py; the session credentials live separately in the
    server-only bankSecrets collection.
    """

    provider: str  # "enablebanking"
    displayName: str  # e.g. "Revolut EUR", for Settings' account list
    currency: str
    consentExpiresAt: int | None  # ms; the bank stops sharing after this
    status: Literal["active", "reconnect-needed", "disconnected"]
    lastError: str | None
    connectedAt: int
    lastSyncedAt: int
    lastBookedDate: str | None  # latest booked transaction date seen, YYYY-MM-DD
    lastImportedCount: int


class DashboardView(TypedDict):
    """Every dashboard figure in one display currency (see dashboard.py)."""

    currency: str
    filipaSalary: float
    autoDetectedFilipaSalary: float
    filipaSalarySource: Literal["manual", "auto", "none"]
    joaoSalary: float
    totalsByCategory: dict[str, float]
    totalExpenses: float
    fixedExpensesTotal: float
    savingsGoalTarget: float
    moneyLeft: float  # income - expenses - fixed expenses
    unconvertedCount: int  # categorized transactions not converted into this currency yet
    # Rate from each currency into this view's currency, used for the
    # hand-entered values (salaries, fixed expenses, savings goal), and the
    # date it's for. None where it couldn't be looked up; missingRate is
    # True if a hand-entered value counted as 0 because of that.
    rates: dict[str, float | None]
    rateDate: str
    missingRate: bool


class DashboardDoc(TypedDict, total=False):
    month: str
    needsReviewCount: int  # transactions without a category yet
    views: dict[str, DashboardView]  # one per display currency
    updatedAt: int
    # Plus the HOME_CURRENCY view's fields repeated at the top level, for
    # app versions from before `views`.
