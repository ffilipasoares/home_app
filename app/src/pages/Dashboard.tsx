import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { subscribeAvailableMonths, subscribeDashboard } from "../lib/dashboard";
import { subscribeCategories, subscribeUserSettings } from "../lib/settings";
import { fetchPreviousMonthFixedIncomes, saveMonthlyIncome, subscribeMonthlyIncome } from "../lib/monthlyIncome";
import { currentMonth } from "../lib/month";
import { MonthPicker } from "../components/MonthPicker";
import { StatTile } from "../components/StatTile";
import { CategoryBarChart } from "../components/CategoryBarChart";
import { SavingsMeter } from "../components/SavingsMeter";
import { FixedItemsEditor } from "../components/FixedItemsEditor";
import { formatCurrency } from "../lib/format";
import type { CategoryDef, DashboardDoc, FixedLineItem, MonthlyIncome, UserSettings } from "../types";

function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1)); // m is 1-indexed; -2 -> previous month, 0-indexed
  return d.toISOString().slice(0, 7);
}

function IncomeEditor({ uid, month, dashboard }: { uid: string; month: string; dashboard: DashboardDoc | null }) {
  const [income, setIncome] = useState<MonthlyIncome>({ salary: null, fixedIncomes: [] });
  const [savedNote, setSavedNote] = useState<string | null>(null);

  useEffect(() => subscribeMonthlyIncome(uid, month, setIncome), [uid, month]);

  async function handleSave() {
    await saveMonthlyIncome(uid, month, income);
    setSavedNote("Saved.");
    setTimeout(() => setSavedNote(null), 2000);
  }

  async function handleCopyFixedIncomes() {
    const items = await fetchPreviousMonthFixedIncomes(uid, previousMonth(month));
    setIncome((cur) => ({ ...cur, fixedIncomes: items }));
  }

  return (
    <div className="card">
      <h2>Income — {month}</h2>
      <div className="field">
        <label>
          Salary this month
          {dashboard && dashboard.autoDetectedSalary > 0 && (
            <> (auto-detected from a "Salary" transaction: {formatCurrency(dashboard.autoDetectedSalary)} — leave blank to use it)</>
          )}
        </label>
        <input
          type="number"
          value={income.salary ?? ""}
          placeholder={dashboard?.autoDetectedSalary ? String(dashboard.autoDetectedSalary) : "Not recorded"}
          onChange={(e) => setIncome({ ...income, salary: e.target.value === "" ? null : Number(e.target.value) })}
        />
      </div>

      <FixedItemsEditor
        title="Other income (e.g. a partner's salary)"
        hint="For household income that doesn't land in this account. Confirmed per month, on purpose — carried forward only if you ask."
        items={income.fixedIncomes}
        onChange={(fixedIncomes: FixedLineItem[]) => setIncome({ ...income, fixedIncomes })}
      />
      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        <button type="button" className="button" onClick={handleSave}>
          Save
        </button>
        <button type="button" className="button secondary" onClick={handleCopyFixedIncomes}>
          Copy from previous month
        </button>
        {savedNote && <span style={{ color: "var(--status-good)", alignSelf: "center" }}>{savedNote}</span>}
      </div>
      {dashboard && dashboard.salarySource === "none" && (
        <p style={{ color: "var(--status-warning)", fontSize: 13, marginBottom: 0 }}>
          No salary recorded for {month} yet — money left below excludes it until you add one.
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

  const categoryLabel = (id: string) => categories.find((c) => c.id === id)?.label ?? id;

  const categoryRows = Object.entries(dashboard?.totalsByCategory ?? {}).map(([id, value]) => ({
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

      {dashboard && dashboard.needsReviewCount > 0 && (
        <div className="card" style={{ borderColor: "var(--status-warning)" }}>
          <Link to="/transactions">
            {dashboard.needsReviewCount} transaction{dashboard.needsReviewCount === 1 ? "" : "s"} need{" "}
            {dashboard.needsReviewCount === 1 ? "s" : ""} a category →
          </Link>
        </div>
      )}

      <IncomeEditor uid={uid} month={month} dashboard={dashboard} />

      {!dashboard && (
        <p className="empty-state">No transactions imported for {month} yet.</p>
      )}

      {dashboard && (
        <>
          <div className="stat-row">
            <StatTile label="Income this month" value={dashboard.salary + dashboard.fixedIncomesTotal} />
            <StatTile label="Money left" value={dashboard.moneyLeft} hero />
          </div>

          <div className="card">
            <h2>Savings goal</h2>
            <SavingsMeter actual={dashboard.savingsActual} target={dashboard.savingsGoalTarget} />
          </div>

          <div className="card">
            <h2>Expenses by category</h2>
            <p style={{ marginTop: 0, fontSize: 12, color: "var(--text-muted)" }}>
              From imported &amp; categorized transactions only — fixed expenses below are added separately.
            </p>
            <CategoryBarChart rows={categoryRows} />
          </div>

          {fixedExpenseItems.length > 0 && (
            <div className="card">
              <h2>Fixed monthly expenses</h2>
              {fixedExpenseItems.map((item) => (
                <div key={item.id} className="tx-row">
                  <span>{item.label}</span>
                  <span className="tx-amount negative">{formatCurrency(-item.amount)}</span>
                </div>
              ))}
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 0 }}>Edit these in Settings.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
