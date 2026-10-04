import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { subscribeAvailableMonths, subscribeDashboard } from "../lib/dashboard";
import { saveDisplayCurrency, subscribeCategories, subscribeUserSettings } from "../lib/settings";
import { saveMonthlyIncome, subscribeMonthlyIncome } from "../lib/monthlyIncome";
import { currentMonth } from "../lib/month";
import { MonthPicker } from "../components/MonthPicker";
import { StatTile } from "../components/StatTile";
import { CategoryBarChart } from "../components/CategoryBarChart";
import { SavingsMeter } from "../components/SavingsMeter";
import { CurrencySwitch } from "../components/CurrencySwitch";
import { formatCurrency } from "../lib/format";
import { ENTRY_CURRENCY } from "../types";
import type { CategoryDef, DashboardDoc, DashboardView, DisplayCurrency, MonthlyIncome, UserSettings } from "../types";

/**
 * The figures for one currency. Dashboards computed before multi-currency
 * views only have the EUR figures at the top level; those still show in EUR
 * (GBP appears once the month is recalculated).
 */
function viewFor(dashboard: DashboardDoc | null, currency: DisplayCurrency): DashboardView | null {
  if (!dashboard) return null;
  const view = dashboard.views?.[currency];
  if (view) return view;
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
    savingsActual: dashboard.savingsActual ?? 0,
    moneyLeft: dashboard.moneyLeft,
    unconvertedCount: dashboard.unconvertedCount ?? 0,
    manualRate: 1,
    manualRateDate: "",
  };
}

// Salaries are entered in ENTRY_CURRENCY (EUR); the hint shows the detected salary in that currency too.
function IncomeEditor({ uid, month, dashboard }: { uid: string; month: string; dashboard: DashboardView | null }) {
  const [income, setIncome] = useState<MonthlyIncome>({ filipaSalary: null, joaoSalary: null });
  const [savedNote, setSavedNote] = useState<string | null>(null);

  useEffect(() => subscribeMonthlyIncome(uid, month, setIncome), [uid, month]);

  async function handleSave() {
    await saveMonthlyIncome(uid, month, income);
    setSavedNote("Saved.");
    setTimeout(() => setSavedNote(null), 2000);
  }

  return (
    <div className="card">
      <h2>Income — {month}</h2>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div className="field" style={{ flex: "1 1 140px", marginBottom: 0 }}>
          <label>
            Filipa's Salary (€)
            {dashboard && dashboard.autoDetectedFilipaSalary > 0 && (
              <> (detected: {formatCurrency(dashboard.autoDetectedFilipaSalary, ENTRY_CURRENCY)})</>
            )}
          </label>
          <input
            type="number"
            value={income.filipaSalary ?? ""}
            placeholder={dashboard?.autoDetectedFilipaSalary ? dashboard.autoDetectedFilipaSalary.toFixed(2) : "Not recorded"}
            onChange={(e) =>
              setIncome({ ...income, filipaSalary: e.target.value === "" ? null : Number(e.target.value) })
            }
          />
        </div>
        <div className="field" style={{ flex: "1 1 140px", marginBottom: 0 }}>
          <label>João's Salary (€)</label>
          <input
            type="number"
            value={income.joaoSalary ?? ""}
            placeholder="Not recorded"
            onChange={(e) => setIncome({ ...income, joaoSalary: e.target.value === "" ? null : Number(e.target.value) })}
          />
        </div>
      </div>

      <button type="button" className="button" style={{ marginTop: 14 }} onClick={handleSave}>
        Save
      </button>
      {savedNote && <span style={{ marginLeft: 12, color: "var(--status-good)" }}>{savedNote}</span>}

      {dashboard && dashboard.filipaSalarySource === "none" && (
        <p style={{ color: "var(--status-warning)", fontSize: 13, marginTop: 10, marginBottom: 0 }}>
          No salary recorded for Filipa this month yet — money left below excludes it until you add one.
        </p>
      )}
    </div>
  );
}

export function Dashboard() {
  const { user } = useAuth();
  const uid = user!.uid;
  const [month, setMonth] = useState(currentMonth());
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [dashboard, setDashboard] = useState<DashboardDoc | null>(null);
  const [categories, setCategories] = useState<CategoryDef[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);

  useEffect(() => subscribeAvailableMonths(uid, setAvailableMonths), [uid]);
  useEffect(() => subscribeDashboard(uid, month, setDashboard), [uid, month]);
  useEffect(() => subscribeCategories(uid, setCategories), [uid]);
  useEffect(() => subscribeUserSettings(uid, setSettings), [uid]);

  const currency: DisplayCurrency = settings?.displayCurrency ?? ENTRY_CURRENCY;
  const view = viewFor(dashboard, currency);
  const entryView = viewFor(dashboard, ENTRY_CURRENCY);
  // Converts a value entered in EUR (rent) into the shown currency, at the month's rate.
  const fromEntry = (value: number) => (view?.manualRate != null ? value * view.manualRate : null);

  const categoryLabel = (id: string) => categories.find((c) => c.id === id)?.label ?? id;

  const categoryRows = Object.entries(view?.totalsByCategory ?? {}).map(([id, value]) => ({
    label: categoryLabel(id),
    value,
  }));

  const fixedExpenseItems = settings?.fixedExpenses ?? [];

  return (
    <div className="screen">
      <h1>Dashboard</h1>
      <div className="field" style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <MonthPicker month={month} availableMonths={availableMonths} onChange={setMonth} />
        </div>
        <CurrencySwitch value={currency} onChange={(c) => saveDisplayCurrency(uid, c)} />
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

      <IncomeEditor uid={uid} month={month} dashboard={entryView} />

      {!dashboard && <p className="empty-state">No transactions imported for {month} yet.</p>}

      {dashboard && !view && (
        <p className="empty-state">
          {currency} figures for {month} aren't calculated yet; they appear the next time this month changes.
        </p>
      )}

      {view && (
        <>
          <div className="stat-row">
            <StatTile label="Income this month" value={view.filipaSalary + view.joaoSalary} currency={currency} />
            <StatTile label="Money left" value={view.moneyLeft} hero currency={currency} />
          </div>

          {currency !== ENTRY_CURRENCY && (
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: -4 }}>
              {view.manualRate != null ? (
                <>
                  Salaries, rent and the savings goal are entered in €, shown here at 1 € ={" "}
                  {view.manualRate.toLocaleString(undefined, { maximumFractionDigits: 6 })} £ (ECB rate,{" "}
                  {view.manualRateDate}). Transactions use the rate for their own date.
                </>
              ) : (
                <>Salaries, rent and the savings goal aren't included in £ right now: the exchange rate couldn't be looked up.</>
              )}
            </p>
          )}

          <div className="card">
            <h2>Savings goal</h2>
            <SavingsMeter actual={view.savingsActual} target={view.savingsGoalTarget} currency={currency} />
          </div>

          <div className="card">
            <h2>Expenses by category</h2>
            <p style={{ marginTop: 0, fontSize: 12, color: "var(--text-muted)" }}>
              From imported &amp; categorized transactions only — fixed expenses below are added separately.
            </p>
            <CategoryBarChart rows={categoryRows} currency={currency} />
          </div>

          {fixedExpenseItems.length > 0 && (
            <div className="card">
              <h2>Fixed monthly expenses</h2>
              {fixedExpenseItems.map((item) => {
                const shown = fromEntry(item.amount);
                return (
                  <div key={item.id} className="tx-row">
                    <span>{item.label}</span>
                    <span className="tx-amount negative">
                      {shown != null ? formatCurrency(-shown, currency) : formatCurrency(-item.amount, ENTRY_CURRENCY)}
                    </span>
                  </div>
                );
              })}
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 0 }}>Edit these in Settings (in €).</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
