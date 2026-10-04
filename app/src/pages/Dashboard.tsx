import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { subscribeAvailableMonths, subscribeDashboard } from "../lib/dashboard";
import { subscribeCategories, subscribeUserSettings } from "../lib/settings";
import { saveMonthlyIncome, subscribeMonthlyIncome } from "../lib/monthlyIncome";
import { useSelectedMonth } from "../lib/selectedMonth";
import { MonthPicker } from "../components/MonthPicker";
import { StatTile } from "../components/StatTile";
import { CategoryBarChart } from "../components/CategoryBarChart";
import { SavingsMeter } from "../components/SavingsMeter";
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
 * Filipa's salary is in the currency chosen in Settings and shows the salary
 * detected from this month's transactions unless you type your own amount;
 * clearing the field goes back to the detected one. João's salary is set in
 * Settings (amount and currency) and only shown here.
 */
function IncomeEditor({
  uid,
  month,
  salaryCurrency,
  salaryView,
  view,
  joaoSetting,
}: {
  uid: string;
  month: string;
  salaryCurrency: DisplayCurrency;
  /** The dashboard figures in the salary currency (for the detected salary). */
  salaryView: DashboardView | null;
  /** The dashboard figures in the currency the Dashboard is showing. */
  view: DashboardView | null;
  /** João's salary from Settings, if set (then it's not edited here). */
  joaoSetting: { amount: number; currency: DisplayCurrency } | null;
}) {
  const [income, setIncome] = useState<MonthlyIncome>({ filipaSalary: null, joaoSalary: null });
  // What's typed in each box; null until edited, so the saved/detected value shows.
  const [filipaDraft, setFilipaDraft] = useState<string | null>(null);
  const [joaoDraft, setJoaoDraft] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  useEffect(
    () =>
      subscribeMonthlyIncome(uid, month, (next) => {
        setIncome(next);
        setFilipaDraft(null);
        setJoaoDraft(null);
      }),
    [uid, month],
  );

  const detected = salaryView && salaryView.autoDetectedFilipaSalary > 0 ? salaryView.autoDetectedFilipaSalary : null;
  const asText = (n: number | null) => (n === null ? "" : String(Math.round(n * 100) / 100));
  const parse = (raw: string) => (raw.trim() === "" ? null : Number(raw));

  const filipaShown = filipaDraft ?? (income.filipaSalary !== null ? asText(income.filipaSalary) : asText(detected));
  const joaoShown = joaoDraft ?? asText(income.joaoSalary);
  // Value used for the "≈" line: what's typed, else saved, else detected.
  const filipaValue = filipaDraft !== null ? parse(filipaDraft) : (income.filipaSalary ?? detected);
  const joaoValue = joaoDraft !== null ? parse(joaoDraft) : income.joaoSalary;

  async function handleSave() {
    await saveMonthlyIncome(uid, month, {
      // An untouched box keeps what was there; untouched detected stays automatic.
      filipaSalary: filipaDraft !== null ? parse(filipaDraft) : income.filipaSalary,
      joaoSalary: joaoDraft !== null ? parse(joaoDraft) : income.joaoSalary,
    });
    setSavedNote("Saved.");
    setTimeout(() => setSavedNote(null), 2000);
  }

  const symbol = salaryCurrency === "GBP" ? "£" : "€";

  return (
    <div className="card">
      <h2>Income — {month}</h2>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div className="field" style={{ flex: "1 1 200px", marginBottom: 0 }}>
          <label>
            Filipa's Salary ({symbol})
          </label>
          <input
            type="number"
            value={filipaShown}
            placeholder="Not recorded"
            onChange={(e) => setFilipaDraft(e.target.value)}
          />
          {income.filipaSalary !== null && filipaDraft === null && detected !== null && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
              Entered by you; detected was {formatCurrency(detected, salaryCurrency)}. Clear the box and save to use it.
            </div>
          )}
          <ConvertedHint value={filipaValue} from={salaryCurrency} view={view} />
        </div>
        <div className="field" style={{ flex: "1 1 200px", marginBottom: 0 }}>
          <label>João's Salary</label>
          {joaoSetting ? (
            <>
              <div style={{ padding: "10px 0", fontWeight: 600 }}>
                {formatCurrency(joaoSetting.amount, joaoSetting.currency)}
              </div>
              <ConvertedHint value={joaoSetting.amount} from={joaoSetting.currency} view={view} />
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Set in Settings.</div>
            </>
          ) : (
            <>
              <input type="number" value={joaoShown} placeholder="Set it in Settings" onChange={(e) => setJoaoDraft(e.target.value)} />
              <ConvertedHint value={joaoValue} from={salaryCurrency} view={view} />
            </>
          )}
        </div>
      </div>

      <button type="button" className="button" style={{ marginTop: 14 }} onClick={handleSave}>
        Save
      </button>
      {savedNote && <span style={{ marginLeft: 12, color: "var(--status-good)" }}>{savedNote}</span>}

      {salaryView && salaryView.filipaSalarySource === "none" && (
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

      <IncomeEditor
        uid={uid}
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

      {view && (
        <>
          <div className="stat-row">
            <StatTile label="Income this month" value={view.filipaSalary + view.joaoSalary} currency={currency} />
            <StatTile label="Money left" value={view.moneyLeft} hero currency={currency} />
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: -4 }}>
            Money left = income {formatCurrency(view.filipaSalary + view.joaoSalary, currency)} − spending{" "}
            {formatCurrency(view.totalExpenses, currency)} − fixed expenses{" "}
            {formatCurrency(view.fixedExpensesTotal, currency)}.
          </p>

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
            <SavingsMeter actual={view.moneyLeft} target={view.savingsGoalTarget} currency={currency} />
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 0 }}>
              What you save is what's left at the end of the month (money left). During the month this shows how much is
              left so far.
            </p>
          </div>

          <div className="card">
            <h2>Expenses by category</h2>
            <p style={{ marginTop: 0, fontSize: 12, color: "var(--text-muted)" }}>
              From imported &amp; categorized transactions only — fixed expenses below are added separately.
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
                      {item.date} · {categoryLabel(item.category)}
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
