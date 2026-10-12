import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { subscribeAvailableMonths, subscribeDashboard } from "../lib/dashboard";
import { viewFor } from "../lib/dashboardView";
import { subscribeCategories, subscribeUserSettings } from "../lib/settings";
import { subscribeMonthTransactions } from "../lib/transactions";
import { useSelectedMonth } from "../lib/selectedMonth";
import { currentMonth, formatMonth, formatShortDate, shiftMonth, todayIso } from "../lib/month";
import { formatMoney } from "../lib/format";
import { ACCENT, MUTED, categoryColors } from "../lib/chartColors";
import { spendOf } from "../lib/spending";
import { daysSinceMonthStart, projectMonth } from "../lib/projection";
import { PageHeader } from "../components/ui/PageHeader";
import { SectionHeader } from "../components/ui/ValueRow";
import { MonthSwitcher } from "../components/MonthSwitcher";
import { CategoryIcon } from "../components/CategoryIcon";
import { SpendingDonut, type Slice } from "../components/analysis/SpendingDonut";
import { IncomeSplitBar, type Part } from "../components/analysis/IncomeSplitBar";
import { CumulativeLine } from "../components/analysis/CumulativeLine";
import { SavedColumns, type MonthSaved } from "../components/analysis/SavedColumns";
import { ENTRY_CURRENCY, UNCATEGORIZED_FIXED } from "../types";
import type { CategoryDef, DashboardDoc, DisplayCurrency, Transaction, UserSettings } from "../types";

const MAX_SLICES = 6;
const HISTORY_MONTHS = 6;

function daysIn(month: string): number {
  return new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
}

/** Running total of spending for each day of `month`, up to `upToDay`. */
function cumulative(transactions: Transaction[], month: string, upToDay: number, spend: (tx: Transaction) => number): number[] {
  const perDay = new Array<number>(upToDay).fill(0);
  for (const tx of transactions) {
    const amount = spend(tx);
    if (!amount) continue;
    // A transaction counted in this month but dated outside it sits on its first or last day.
    const day = tx.date.slice(0, 7) < month ? 1 : tx.date.slice(0, 7) > month ? upToDay : Number(tx.date.slice(8, 10));
    if (day >= 1 && day <= upToDay) perDay[day - 1] += amount;
  }
  let sum = 0;
  return perDay.map((v) => (sum += v));
}

function Card({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <SectionHeader id={id} title={title} note={note} />
      <div className="mt-3 rounded-2xl bg-surface p-4">{children}</div>
    </section>
  );
}

/**
 * Monthly analysis, for the month picked on the Dashboard: where the money
 * went, how income is projected to split, the pace of spending against last
 * month, what was saved month by month, and the biggest expenses. Same data
 * and sums as the Dashboard.
 */
export function Analysis() {
  const { user } = useAuth();
  const uid = user!.uid;
  const { month } = useSelectedMonth();
  const prevMonth = shiftMonth(month, -1);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [categories, setCategories] = useState<CategoryDef[]>([]);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [dashboards, setDashboards] = useState<Record<string, DashboardDoc | null>>({});
  const [txNow, setTxNow] = useState<Transaction[]>([]);
  const [txPrev, setTxPrev] = useState<Transaction[]>([]);

  useEffect(() => subscribeUserSettings(uid, setSettings), [uid]);
  useEffect(() => subscribeCategories(uid, setCategories), [uid]);
  useEffect(() => subscribeAvailableMonths(uid, setAvailableMonths), [uid]);
  useEffect(() => subscribeMonthTransactions(uid, month, setTxNow), [uid, month]);
  useEffect(() => subscribeMonthTransactions(uid, prevMonth, setTxPrev), [uid, prevMonth]);

  // The selected month and the months before it that have data, for the history chart.
  const historyMonths = Array.from(new Set([month, ...availableMonths]))
    .filter((m) => m <= month)
    .sort()
    .slice(-HISTORY_MONTHS);
  const historyKey = historyMonths.join(",");
  useEffect(() => {
    const unsubs = historyKey
      .split(",")
      .filter(Boolean)
      .map((m) => subscribeDashboard(uid, m, (doc) => setDashboards((prev) => ({ ...prev, [m]: doc }))));
    return () => unsubs.forEach((u) => u());
  }, [uid, historyKey]);

  const currency: DisplayCurrency = settings?.displayCurrency ?? ENTRY_CURRENCY;
  const view = viewFor(dashboards[month] ?? null, currency);
  const colorOf = categoryColors(categories);
  const categoryById = (id: string) => categories.find((c) => c.id === id);
  const labelOf = (id: string) => (id === UNCATEGORIZED_FIXED ? "Fixed, no category yet" : (categoryById(id)?.label ?? id));
  const fmt = (n: number) => formatMoney(n, currency);

  const byCategory = Object.entries(view?.totalsByCategory ?? {})
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1]);

  // Donut: at most six slices; past that the smallest fold into "Other".
  const slices: Slice[] = byCategory.slice(0, byCategory.length > MAX_SLICES ? MAX_SLICES - 1 : MAX_SLICES).map(([id, amount]) => ({
    id,
    label: labelOf(id),
    amount,
    color: colorOf(id),
  }));
  if (byCategory.length > MAX_SLICES) {
    const rest = byCategory.slice(MAX_SLICES - 1);
    slices.push({ id: "_other", label: `Other (${rest.length})`, amount: rest.reduce((s, [, a]) => s + a, 0), color: MUTED });
  }

  // Projection, exactly as on the Dashboard's Estimated savings card.
  const fixedSpending = (settings?.fixedExpenses ?? []).filter((f) => categoryById(f.category ?? "")?.special !== "savings");
  const fixedIds = new Set(fixedSpending.map((f) => (f.category && categoryById(f.category) ? f.category : UNCATEGORIZED_FIXED)));
  const income = view ? view.filipaSalary + view.joaoSalary : 0;
  const days = daysSinceMonthStart(month);
  const projection = projectMonth(byCategory, fixedIds, income, days);
  const projecting = month === currentMonth() && days <= 29;
  const parts: Part[] = [
    ...[...projection.rows]
      .sort((a, b) => b.estimate - a.estimate)
      .map((r) => ({
        id: r.id,
        label: labelOf(r.id),
        amount: r.estimate,
        color: colorOf(r.id),
        note: projecting ? (r.fixed ? "Fixed, as is" : `${fmt(r.spent)} so far`) : undefined,
      })),
    {
      id: "_savings",
      label: projecting ? "Savings" : "Saved",
      note: projecting ? "Estimated" : undefined,
      amount: Math.max(0, projection.savings),
      color: ACCENT,
      emphasis: true,
    },
  ];

  // Pace: spending added up by day, this month against last month (fixed bills left out).
  const spend = (tx: Transaction) => spendOf(tx, categories, currency);
  const today = todayIso();
  const monthDays = daysIn(month);
  const upTo = month === currentMonth() ? Number(today.slice(8, 10)) : monthDays;
  const thisRun = cumulative(txNow, month, upTo, spend);
  const lastRun = cumulative(txPrev, prevMonth, daysIn(prevMonth), spend);
  const nowTotal = thisRun[thisRun.length - 1] ?? 0;
  const sameDayLast = lastRun[Math.min(upTo, lastRun.length) - 1] ?? 0;
  const pace = sameDayLast > 0 ? (nowTotal - sameDayLast) / sameDayLast : null;

  // Saved per month, the Dashboard's sum: income − spending − fixed bills.
  const history: MonthSaved[] = historyMonths.flatMap((m) => {
    const v = viewFor(dashboards[m] ?? null, currency);
    if (!v) return [];
    const d = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1);
    return [
      {
        month: m,
        label: d.toLocaleDateString("en-GB", { month: "short" }),
        fullLabel: d.toLocaleDateString("en-GB", { month: "short", year: "numeric" }),
        saved: v.filipaSalary + v.joaoSalary - v.totalExpenses - v.fixedExpensesTotal,
        goal: v.savingsGoalTarget,
      },
    ];
  });

  const biggest = txNow
    .map((tx) => ({ tx, amount: spend(tx) }))
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  return (
    <>
      <PageHeader>
        <MonthSwitcher firstMonth={availableMonths.length ? availableMonths[availableMonths.length - 1] : undefined} />
      </PageHeader>

      <div className="space-y-10 px-5 pb-8">
        {!view ? (
          <p className="rounded-2xl bg-surface px-4 py-10 text-center text-sm text-muted">
            No figures for {formatMonth(month)} yet.
          </p>
        ) : (
          <>
            <Card
              id="split-heading"
              title="Where the money went"
              note="Spending so far by category, fixed bills included."
            >
              {slices.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">No spending recorded this month yet.</p>
              ) : (
                <SpendingDonut slices={slices} currency={currency} />
              )}
            </Card>

            <Card
              id="income-split-heading"
              title={projecting ? "Estimated month" : "How income was used"}
              note={
                projecting
                  ? `Each category projected to a 29-day month (day ${days}), as a share of income ${fmt(income)}.`
                  : `Each category as a share of income ${fmt(income)}.`
              }
            >
              {income > 0 ? (
                <IncomeSplitBar parts={parts} base={income} currency={currency} />
              ) : (
                <p className="py-6 text-center text-sm text-muted">No income recorded for this month yet.</p>
              )}
              {projection.savings < 0 && (
                <p className="mt-3 text-[13px] text-muted">
                  At this pace spending passes income by {fmt(-projection.savings)}.
                </p>
              )}
            </Card>

            <Card
              id="pace-heading"
              title="Spending pace"
              note={
                pace === null
                  ? "Spending added up day by day; fixed bills are left out."
                  : `${fmt(nowTotal)} by day ${upTo}: ${Math.abs(Math.round(pace * 100))}% ${pace >= 0 ? "more" : "less"} than by the same day last month (${fmt(sameDayLast)}). Fixed bills left out.`
              }
            >
              <CumulativeLine
                thisMonth={thisRun}
                lastMonth={lastRun}
                daysInMonth={monthDays}
                currency={currency}
                thisLabel={formatMonth(month)}
                lastLabel={formatMonth(prevMonth)}
              />
            </Card>

            {history.length > 0 && (
              <Card
                id="saved-heading"
                title="Saved each month"
                note={`Income − spending − fixed bills. The line is the savings goal (${fmt(view.savingsGoalTarget)}).`}
              >
                <SavedColumns months={history} selected={month} currency={currency} />
              </Card>
            )}

            <section aria-labelledby="biggest-heading">
              <SectionHeader
                id="biggest-heading"
                title="Biggest expenses"
                aside={
                  <Link to="/transactions" className="text-sm font-medium text-accent hover:underline">
                    All transactions
                  </Link>
                }
              />
              {biggest.length === 0 ? (
                <p className="mt-3 rounded-2xl bg-surface px-4 py-6 text-center text-sm text-muted">No spending yet.</p>
              ) : (
                <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl bg-surface">
                  {biggest.map(({ tx, amount }) => (
                    <li key={tx.id} className="flex items-center gap-3 px-4 py-3">
                      <CategoryIcon category={categoryById(tx.category ?? "")} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium">{tx.merchantRaw}</span>
                        <span className="block truncate text-[13px] text-muted">
                          {formatShortDate(tx.date)} · {labelOf(tx.category ?? "")}
                        </span>
                      </span>
                      <span className="shrink-0 text-[15px] font-semibold tabular-nums">{fmt(amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
}
