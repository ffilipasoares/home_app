import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { subscribeAvailableMonths, subscribeDashboard } from "../lib/dashboard";
import { subscribeCategories } from "../lib/settings";
import { currentMonth } from "../lib/month";
import { MonthPicker } from "../components/MonthPicker";
import { StatTile } from "../components/StatTile";
import { CategoryBarChart } from "../components/CategoryBarChart";
import { NeededSplitBar } from "../components/NeededSplitBar";
import { SavingsMeter } from "../components/SavingsMeter";
import type { CategoryDef, DashboardDoc } from "../types";

export function Dashboard() {
  const { user } = useAuth();
  const uid = user!.uid;
  const [month, setMonth] = useState(currentMonth());
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [dashboard, setDashboard] = useState<DashboardDoc | null>(null);
  const [categories, setCategories] = useState<CategoryDef[]>([]);

  useEffect(() => subscribeAvailableMonths(uid, setAvailableMonths), [uid]);
  useEffect(() => subscribeDashboard(uid, month, setDashboard), [uid, month]);
  useEffect(() => subscribeCategories(uid, setCategories), [uid]);

  const categoryLabel = (id: string) => categories.find((c) => c.id === id)?.label ?? id;

  const categoryRows = Object.entries(dashboard?.totalsByCategory ?? {}).map(([id, value]) => ({
    label: categoryLabel(id),
    value,
  }));

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
            <StatTile label="Salary this month" value={dashboard.salary} />
            <StatTile label="Money left" value={dashboard.moneyLeft} hero />
          </div>

          <div className="card">
            <h2>Needed vs discretionary</h2>
            <NeededSplitBar needed={dashboard.neededTotal} discretionary={dashboard.discretionaryTotal} />
          </div>

          <div className="card">
            <h2>Savings goal</h2>
            <SavingsMeter actual={dashboard.savingsActual} target={dashboard.savingsGoalTarget} />
          </div>

          <div className="card">
            <h2>Expenses by category</h2>
            <CategoryBarChart rows={categoryRows} />
          </div>
        </>
      )}
    </div>
  );
}
