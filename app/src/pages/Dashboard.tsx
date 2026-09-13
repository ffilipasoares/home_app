import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { subscribeAvailableMonths, subscribeDashboard } from "../lib/dashboard";
import { subscribeCategories, subscribeUserSettings } from "../lib/settings";
import { saveMonthlyIncome, subscribeMonthlyIncome } from "../lib/monthlyIncome";
import { currentMonth } from "../lib/month";
import { MonthPicker } from "../components/MonthPicker";
import { StatTile } from "../components/StatTile";
import { CategoryBarChart } from "../components/CategoryBarChart";
import { SavingsMeter } from "../components/SavingsMeter";
import { formatCurrency } from "../lib/format";
import type { CategoryDef, DashboardDoc, MonthlyIncome, UserSettings } from "../types";

function IncomeEditor({ uid, month, dashboard }: { uid: string; month: string; dashboard: DashboardDoc | null }) {
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
            Filipa's Salary
            {dashboard && dashboard.autoDetectedFilipaSalary > 0 && (
              <> (detected: {formatCurrency(dashboard.autoDetectedFilipaSalary)})</>
            )}
          </label>
          <input
            type="number"
            value={income.filipaSalary ?? ""}
            placeholder={dashboard?.autoDetectedFilipaSalary ? String(dashboard.autoDetectedFilipaSalary) : "Not recorded"}
            onChange={(e) =>
              setIncome({ ...income, filipaSalary: e.target.value === "" ? null : Number(e.target.value) })
            }
          />
        </div>
        <div className="field" style={{ flex: "1 1 140px", marginBottom: 0 }}>
          <label>João's Salary</label>
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
            <StatTile label="Income this month" value={dashboard.filipaSalary + dashboard.joaoSalary} />
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
