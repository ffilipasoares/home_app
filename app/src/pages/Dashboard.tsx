import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { subscribeAvailableMonths, subscribeDashboard } from "../lib/dashboard";
import { subscribeCategories, subscribeUserSettings } from "../lib/settings";
import { currentMonth } from "../lib/month";
import { MonthPicker } from "../components/MonthPicker";
import { StatTile } from "../components/StatTile";
import { CategoryBarChart } from "../components/CategoryBarChart";
import { SavingsMeter } from "../components/SavingsMeter";
import { formatCurrency } from "../lib/format";
import type { CategoryDef, DashboardDoc, UserSettings } from "../types";

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

  const fixedItems = [
    ...(settings?.fixedIncomes ?? []).map((item) => ({ ...item, amount: item.amount })),
    ...(settings?.fixedExpenses ?? []).map((item) => ({ ...item, amount: -item.amount })),
  ];

  return (
    <div className="screen">
      <h1>Dashboard</h1>
      <div className="field">
        <MonthPicker month={month} availableMonths={availableMonths} onChange={setMonth} />
      </div>

      {!dashboard && (
        <p className="empty-state">
          No data for {month} yet. Import a statement to get started.
        </p>
      )}

      {dashboard && dashboard.needsReviewCount > 0 && (
        <div className="card" style={{ borderColor: "var(--status-warning)" }}>
          <Link to="/transactions">
            {dashboard.needsReviewCount} transaction{dashboard.needsReviewCount === 1 ? "" : "s"} need{" "}
            {dashboard.needsReviewCount === 1 ? "s" : ""} a category →
          </Link>
        </div>
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
              From imported &amp; categorized transactions only — fixed items below are added separately.
            </p>
            <CategoryBarChart rows={categoryRows} />
          </div>

          {fixedItems.length > 0 && (
            <div className="card">
              <h2>Fixed monthly items</h2>
              {fixedItems.map((item) => (
                <div key={item.id} className="tx-row">
                  <span>{item.label}</span>
                  <span className={`tx-amount ${item.amount >= 0 ? "positive" : "negative"}`}>
                    {formatCurrency(item.amount)}
                  </span>
                </div>
              ))}
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 0 }}>
                Edit these in Settings.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
