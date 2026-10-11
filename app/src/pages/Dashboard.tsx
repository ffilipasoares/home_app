import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { subscribeAvailableMonths, subscribeDashboard } from "../lib/dashboard";
import { subscribeCategories, subscribeUserSettings } from "../lib/settings";
import { useSelectedMonth } from "../lib/selectedMonth";
import { MonthPicker } from "../components/MonthPicker";
import { StatTile } from "../components/StatTile";
import { CategoryBarChart } from "../components/CategoryBarChart";
import { SavingsMeter } from "../components/SavingsMeter";
import { formatCurrency } from "../lib/format";
import { DISPLAY_CURRENCIES, ENTRY_CURRENCY, UNCATEGORIZED_FIXED } from "../types";
import type { CategoryDef, DashboardDoc, DashboardView, DisplayCurrency, UserSettings } from "../types";

/**
 * The figures for one currency. Dashboards computed before multi-currency
 * views only have the EUR figures at the top level; those still show in EUR
 * (GBP appears once the month is recalculated).
 */
function viewFor(dashboard: DashboardDoc | null, currency: DisplayCurrency): DashboardView | null {
  if (!dashboard) return null;
  const view = dashboard.views?.[currency];
  // Views computed by the previous version have no `rates` yet; treat them as
  // "no rate known" until the month is recalculated.
  if (view) return { ...view, rates: view.rates ?? { [currency]: 1 }, missingRate: view.missingRate ?? false };
  if (currency !== "EUR" || dashboard.moneyLeft === undefined) return null;
  return {
    currency: "EUR",
    filipaSalary: dashboard.filipaSalary ?? 0,
    autoDetectedFilipaSalary: dashboard.autoDetectedFilipaSalary ?? 0,
    filipaSalarySource: dashboard.filipaSalarySource ?? "none",
    joaoSalary: dashboard.joaoSalary ?? 0,
    totalsByCategory: dashboard.totalsByCategory ?? {},
    totalExpenses: dashboard.totalExpenses ?? 0,
    fixedExpensesTotal: dashboard.fixedExpensesTotal ?? 0,
    savingsGoalTarget: dashboard.savingsGoalTarget ?? 0,
    moneyLeft: dashboard.moneyLeft,
    unconvertedCount: dashboard.unconvertedCount ?? 0,
    rates: { EUR: 1 },
    rateDate: "",
    missingRate: false,
  };
}

/** "≈ £2,094.02" under an amount entered in another currency than the one shown. */
function ConvertedHint({ value, from, view }: { value: number | null; from: DisplayCurrency; view: DashboardView | null }) {
  if (value === null || !view || from === view.currency) return null;
  const rate = view.rates[from];
  return (
    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
      {rate != null ? <>≈ {formatCurrency(value * rate, view.currency)}</> : <>{view.currency} rate unavailable right now</>}
    </div>
  );
}

/**
 * The month's income, read-only: Filipa's salary (typed in Settings, or
 * detected from this month's Salary transactions) and João's (Settings).
 * Each in the currency it's paid in, with the app currency underneath when
 * that's different. Both are edited in Settings.
 */
function IncomeCard({
  month,
  salaryCurrency,
  salaryView,
  view,
  joaoSetting,
}: {
  month: string;
  salaryCurrency: DisplayCurrency;
  /** The dashboard figures in the salary currency. */
  salaryView: DashboardView | null;
  /** The dashboard figures in the currency the Dashboard is showing. */
  view: DashboardView | null;
  joaoSetting: { amount: number; currency: DisplayCurrency } | null;
}) {
  const filipa = salaryView && salaryView.filipaSalarySource !== "none" ? salaryView.filipaSalary : null;
  const amount = (value: number | null, from: DisplayCurrency) => (
    <>
      {value !== null ? (
        <div style={{ padding: "6px 0 0", fontWeight: 600, fontSize: 20 }}>{formatCurrency(value, from)}</div>
      ) : (
        <div style={{ padding: "6px 0 0", fontSize: 15, color: "var(--text-muted)" }}>Not detected yet</div>
      )}
      <ConvertedHint value={value} from={from} view={view} />
    </>
  );

  return (
    <div className="card">
      <h2>Income — {month}</h2>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 160px" }}>
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Filipa's Salary</div>
          {amount(filipa, salaryCurrency)}
        </div>
        <div style={{ flex: "1 1 160px" }}>
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>João's Salary</div>
          {joaoSetting ? amount(joaoSetting.amount, joaoSetting.currency) : amount(view?.joaoSalary || null, view?.currency ?? salaryCurrency)}
        </div>
      </div>
    </div>
  );
}

export function Dashboard() {
  const { user } = useAuth();
  const uid = user!.uid;
  const { month, setMonth } = useSelectedMonth();
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [dashboard, setDashboard] = useState<DashboardDoc | null>(null);
  const [categories, setCategories] = useState<CategoryDef[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);

  useEffect(() => subscribeAvailableMonths(uid, setAvailableMonths), [uid]);
  useEffect(() => subscribeDashboard(uid, month, setDashboard), [uid, month]);
  useEffect(() => subscribeCategories(uid, setCategories), [uid]);
  useEffect(() => subscribeUserSettings(uid, setSettings), [uid]);

  // The app currency, chosen in Settings: every figure here is shown in it.
  const currency: DisplayCurrency = settings?.displayCurrency ?? ENTRY_CURRENCY;
  const view = viewFor(dashboard, currency);
  const salaryCurrency: DisplayCurrency = settings?.salaryCurrency ?? ENTRY_CURRENCY;
  // Converts a hand-entered value (e.g. rent) from its own currency into the shown one, at the month's rate.
  const convert = (value: number, from: DisplayCurrency) => {
    const rate = view?.rates[from];
    return rate != null ? value * rate : null;
  };
  // Worked out here from the parts shown on this page, so the totals always
  // match them, even for a month the server last calculated with an older
  // formula (its moneyLeft is the same sum: functions/dashboard.py).
  const totals = view && {
    income: view.filipaSalary + view.joaoSalary,
    savedSoFar: view.filipaSalary + view.joaoSalary - view.totalExpenses - view.fixedExpensesTotal,
    moneyLeft: view.filipaSalary + view.joaoSalary - view.totalExpenses - view.fixedExpensesTotal - view.savingsGoalTarget,
  };
  const otherCurrency = DISPLAY_CURRENCIES.find((c) => c !== currency);

  const categoryLabel = (id: string) =>
    id === UNCATEGORIZED_FIXED ? "Fixed expenses, no category yet" : (categories.find((c) => c.id === id)?.label ?? id);

  const categoryRows = Object.entries(view?.totalsByCategory ?? {}).map(([id, value]) => ({
    label: categoryLabel(id),
    value,
  }));

  // One in an investments category is listed under Investments instead.
  const fixedExpenseItems = (settings?.fixedExpenses ?? []).filter(
    (item) => categories.find((c) => c.id === item.category)?.special !== "savings",
  );

  return (
    <div className="screen">
      <h1>Dashboard</h1>
      <div className="field">
        <MonthPicker month={month} availableMonths={availableMonths} onChange={setMonth} />
      </div>

      {view && view.unconvertedCount > 0 && (
        <div className="card" style={{ borderColor: "var(--status-warning)" }}>
          {view.unconvertedCount} transaction{view.unconvertedCount === 1 ? " isn't" : "s aren't"} in the {currency} totals
          yet: {view.unconvertedCount === 1 ? "its" : "their"} {currency} amount is still being looked up. This fills in
          automatically.
        </div>
      )}

      {dashboard && dashboard.needsReviewCount > 0 && (
        <div className="card" style={{ borderColor: "var(--status-warning)" }}>
          <Link to="/transactions">
            {dashboard.needsReviewCount} transaction{dashboard.needsReviewCount === 1 ? "" : "s"} need{" "}
            {dashboard.needsReviewCount === 1 ? "s" : ""} a category →
          </Link>
        </div>
      )}

      <IncomeCard
        month={month}
        salaryCurrency={salaryCurrency}
        salaryView={viewFor(dashboard, salaryCurrency)}
        view={view}
        joaoSetting={settings?.joaoSalary ?? null}
      />

      {!dashboard && <p className="empty-state">No transactions imported for {month} yet.</p>}

      {dashboard && !view && (
        <p className="empty-state">
          {currency} figures for {month} aren't calculated yet; they appear the next time this month changes.
        </p>
      )}

      {view && totals && (
        <>
          <div className="stat-row">
            <StatTile label="Income this month" value={totals.income} currency={currency} />
            <StatTile label="Money left" value={totals.moneyLeft} hero currency={currency} />
          </div>
          {view.missingRate && otherCurrency && (
            <p style={{ fontSize: 12, color: "var(--status-warning)", marginTop: -4 }}>
              Some amounts you entered in {otherCurrency} aren't included right now: the exchange rate couldn't be looked
              up.
            </p>
          )}

          <div className="card">
            <h2>Savings goal</h2>
            <SavingsMeter
              actual={totals.savedSoFar}
              target={view.savingsGoalTarget}
              currency={currency}
            />
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 0 }}>
              Money left already has the goal set aside. Saved so far = income − spending − fixed expenses.
            </p>
          </div>

          <div className="card">
            <h2>Money spent</h2>
            <div className="stat-value" style={{ fontSize: 28, marginBottom: 8 }}>
              {formatCurrency(view.totalExpenses + view.fixedExpensesTotal, currency)}
            </div>
            <div className="tx-row">
              <span>Spending</span>
              <span className="tx-amount">{formatCurrency(view.totalExpenses, currency)}</span>
            </div>
            <div className="tx-row">
              <span>Fixed expenses</span>
              <span className="tx-amount">{formatCurrency(view.fixedExpensesTotal, currency)}</span>
            </div>
          </div>

          <div className="card">
            <h2>Expenses by category</h2>
            <p style={{ marginTop: 0, fontSize: 12, color: "var(--text-muted)" }}>
              Categorized transactions plus your fixed monthly expenses.
            </p>
            <CategoryBarChart rows={categoryRows} currency={currency} />
          </div>

          {(view.investments?.length ?? 0) > 0 && (
            <div className="card">
              <h2>Investments</h2>
              <p style={{ marginTop: 0, fontSize: 12, color: "var(--text-muted)" }}>
                Money moved to investments this month. Kept apart: not spending, not in money left, not in the savings goal.
              </p>
              <div className="stat-value" style={{ fontSize: 28, marginBottom: 8 }}>
                {formatCurrency(view.investmentsTotal ?? 0, currency)}
              </div>
              {view.investments!.map((item, i) => (
                <div key={`${item.date}-${i}`} className="tx-row">
                  <div className="tx-main" style={{ flex: 1, minWidth: 0 }}>
                    <div className="tx-merchant">{item.merchant}</div>
                    <div className="tx-date">
                      {item.fixed ? "Every month" : item.date} · {categoryLabel(item.category)}
                    </div>
                  </div>
                  <div className={`tx-amount ${item.amount >= 0 ? "positive" : "negative"}`}>
                    {item.amount >= 0 ? "" : "taken out "}
                    {formatCurrency(Math.abs(item.amount), currency)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {fixedExpenseItems.length > 0 && (
            <div className="card">
              <h2>Fixed monthly expenses</h2>
              {fixedExpenseItems.map((item) => {
                const from = item.currency ?? ENTRY_CURRENCY;
                const shown = convert(item.amount, from);
                return (
                  <div key={item.id} className="tx-row">
                    <div className="tx-main" style={{ flex: 1, minWidth: 0 }}>
                      <div className="tx-merchant">{item.label}</div>
                      <div className="tx-date">
                        {item.category ? categoryLabel(item.category) : "Category: AI is picking one…"}
                      </div>
                    </div>
                    <span className="tx-amount negative">
                      {shown != null ? formatCurrency(-shown, currency) : formatCurrency(-item.amount, from)}
                    </span>
                  </div>
                );
              })}
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 0 }}>Edit these in Settings.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
