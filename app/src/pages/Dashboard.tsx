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
import { CurrencySelect } from "../components/CurrencySelect";
import { formatCurrency } from "../lib/format";
import { DISPLAY_CURRENCIES, ENTRY_CURRENCY } from "../types";
import type { CategoryDef, DashboardDoc, DashboardView, DisplayCurrency, MonthlyIncome, UserSettings } from "../types";

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
    savingsActual: dashboard.savingsActual ?? 0,
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
 * Each salary is entered in its own currency (€ or £) and stored exactly as
 * typed; the Dashboard's currency only changes how it's shown.
 */
function IncomeEditor({ uid, month, view }: { uid: string; month: string; view: DashboardView | null }) {
  const [income, setIncome] = useState<MonthlyIncome>({ filipaSalary: null, joaoSalary: null });
  const [savedNote, setSavedNote] = useState<string | null>(null);

  useEffect(() => subscribeMonthlyIncome(uid, month, setIncome), [uid, month]);

  async function handleSave() {
    await saveMonthlyIncome(uid, month, income);
    setSavedNote("Saved.");
    setTimeout(() => setSavedNote(null), 2000);
  }

  const filipaCurrency = income.filipaSalaryCurrency ?? ENTRY_CURRENCY;
  const joaoCurrency = income.joaoSalaryCurrency ?? ENTRY_CURRENCY;
  const parse = (raw: string) => (raw === "" ? null : Number(raw));

  return (
    <div className="card">
      <h2>Income — {month}</h2>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div className="field" style={{ flex: "1 1 200px", marginBottom: 0 }}>
          <label>
            Filipa's Salary
            {view && view.autoDetectedFilipaSalary > 0 && (
              <> (detected: {formatCurrency(view.autoDetectedFilipaSalary, view.currency)})</>
            )}
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="number"
              value={income.filipaSalary ?? ""}
              placeholder="Not recorded"
              onChange={(e) => setIncome({ ...income, filipaSalary: parse(e.target.value) })}
              style={{ flex: 1, minWidth: 0 }}
            />
            <CurrencySelect
              label="Filipa's salary currency"
              value={filipaCurrency}
              onChange={(c) => setIncome({ ...income, filipaSalaryCurrency: c })}
            />
          </div>
          <ConvertedHint value={income.filipaSalary} from={filipaCurrency} view={view} />
        </div>
        <div className="field" style={{ flex: "1 1 200px", marginBottom: 0 }}>
          <label>João's Salary</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="number"
              value={income.joaoSalary ?? ""}
              placeholder="Not recorded"
              onChange={(e) => setIncome({ ...income, joaoSalary: parse(e.target.value) })}
              style={{ flex: 1, minWidth: 0 }}
            />
            <CurrencySelect
              label="João's salary currency"
              value={joaoCurrency}
              onChange={(c) => setIncome({ ...income, joaoSalaryCurrency: c })}
            />
          </div>
          <ConvertedHint value={income.joaoSalary} from={joaoCurrency} view={view} />
        </div>
      </div>

      <button type="button" className="button" style={{ marginTop: 14 }} onClick={handleSave}>
        Save
      </button>
      {savedNote && <span style={{ marginLeft: 12, color: "var(--status-good)" }}>{savedNote}</span>}

      {view && view.filipaSalarySource === "none" && (
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
  // Converts a hand-entered value (e.g. rent) from its own currency into the shown one, at the month's rate.
  const convert = (value: number, from: DisplayCurrency) => {
    const rate = view?.rates[from];
    return rate != null ? value * rate : null;
  };
  const otherCurrency = DISPLAY_CURRENCIES.find((c) => c !== currency);
  const otherRate = otherCurrency ? view?.rates[otherCurrency] : null;

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

      <IncomeEditor uid={uid} month={month} view={view} />

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

          {otherCurrency && view.rateDate && (
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: -4 }}>
              {view.missingRate ? (
                <>
                  Some amounts you entered in {otherCurrency} aren't included right now: the exchange rate couldn't be
                  looked up.
                </>
              ) : otherRate != null ? (
                <>
                  Amounts you entered in {otherCurrency} are shown at 1 {otherCurrency} ={" "}
                  {otherRate.toLocaleString(undefined, { maximumFractionDigits: 6 })} {currency} (ECB rate, {view.rateDate}).
                  Transactions use the rate for their own date.
                </>
              ) : null}
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
                const from = item.currency ?? ENTRY_CURRENCY;
                const shown = convert(item.amount, from);
                return (
                  <div key={item.id} className="tx-row">
                    <span>{item.label}</span>
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
