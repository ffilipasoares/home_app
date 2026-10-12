import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangleIcon, CalendarClockIcon, ChevronRightIcon, CreditCardIcon } from "lucide-react";
import { useAuth } from "../lib/auth";
import { subscribeAvailableMonths, subscribeDashboard } from "../lib/dashboard";
import { subscribeCategories, subscribeUserSettings } from "../lib/settings";
import { useSelectedMonth } from "../lib/selectedMonth";
import { currentMonth, formatMonth, formatShortDate } from "../lib/month";
import { formatMoney } from "../lib/format";
import { PageHeader } from "../components/ui/PageHeader";
import { IconTile } from "../components/ui/IconTile";
import { Notice, RowGroup, SectionHeader, ValueRow } from "../components/ui/ValueRow";
import { MonthSwitcher } from "../components/MonthSwitcher";
import { CategoryIcon } from "../components/CategoryIcon";
import { categoryLook } from "../lib/categoryLook";
import { MoneyLeftHero } from "../components/dashboard/MoneyLeftHero";
import { IncomeAllocation } from "../components/dashboard/IncomeAllocation";
import { EstimatedSavings } from "../components/dashboard/EstimatedSavings";
import { viewFor } from "../lib/dashboardView";
import { ENTRY_CURRENCY, UNCATEGORIZED_FIXED } from "../types";
import type { CategoryDef, DashboardDoc, DashboardView, DisplayCurrency, UserSettings } from "../types";

const FILIPA_SOURCE: Record<DashboardView["filipaSalarySource"], string> = {
  manual: "Fixed amount",
  auto: "Detected",
  none: "Not detected yet",
};

export function Dashboard() {
  const { user } = useAuth();
  const uid = user!.uid;
  const { month } = useSelectedMonth();
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
  const fmt = (n: number) => formatMoney(n, currency);
  const firstMonth = availableMonths.length ? availableMonths[availableMonths.length - 1] : undefined;

  // Worked out here from the parts shown on this page, so the totals always
  // match them, even for a month the server last calculated with an older
  // formula (its moneyLeft is the same sum: functions/dashboard.py).
  const totals = view && {
    income: view.filipaSalary + view.joaoSalary,
    moneyLeft: view.filipaSalary + view.joaoSalary - view.totalExpenses - view.fixedExpensesTotal - view.savingsGoalTarget,
  };

  const categoryById = (id: string) => categories.find((c) => c.id === id);
  const categoryLabel = (id: string) =>
    id === UNCATEGORIZED_FIXED ? "Fixed, no category yet" : (categoryById(id)?.label ?? id);

  const fixedItems = settings?.fixedExpenses ?? [];
  // Fixed expenses in an investments category are listed under Investments instead.
  const fixedSpending = fixedItems.filter((item) => categoryById(item.category ?? "")?.special !== "savings");
  const fixedNamesIn = (categoryId: string) =>
    fixedSpending
      .filter((item) => (item.category && categoryById(item.category) ? item.category : UNCATEGORIZED_FIXED) === categoryId)
      .map((item) => item.label);

  const byCategory = Object.entries(view?.totalsByCategory ?? {})
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1]);
  const maxCategory = byCategory[0]?.[1] ?? 1;
  const pendingCount = dashboard?.pendingCount ?? 0;

  return (
    <>
      <PageHeader>
        <MonthSwitcher firstMonth={firstMonth} />
      </PageHeader>

      <div className="space-y-10 px-5 pb-8">
        {Boolean(dashboard?.needsReviewCount || view?.unconvertedCount || view?.missingRate) && (
          <div className="space-y-2">
            {dashboard && dashboard.needsReviewCount > 0 && (
              <Link
                to="/transactions"
                className="flex items-center gap-3 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm font-medium transition-colors hover:bg-warning/15"
              >
                <AlertTriangleIcon className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                <span className="flex-1">
                  {dashboard.needsReviewCount} transaction{dashboard.needsReviewCount === 1 ? " needs" : "s need"} a
                  category
                </span>
                <ChevronRightIcon className="h-4 w-4 text-subtle" aria-hidden="true" />
              </Link>
            )}
            {view && view.unconvertedCount > 0 && (
              <Notice>
                {view.unconvertedCount} transaction{view.unconvertedCount === 1 ? " isn't" : "s aren't"} in the{" "}
                {currency} totals yet: the exchange rate is still being looked up. This fills in on its own.
              </Notice>
            )}
            {view?.missingRate && (
              <Notice tone="warning">
                Some amounts you entered in the other currency aren't included right now: the exchange rate couldn't be
                looked up.
              </Notice>
            )}
          </div>
        )}

        {!dashboard && (
          <p className="rounded-2xl bg-surface px-4 py-10 text-center text-sm text-muted">
            No transactions imported for {formatMonth(month)} yet.
          </p>
        )}
        {dashboard && !view && (
          <p className="rounded-2xl bg-surface px-4 py-10 text-center text-sm text-muted">
            {currency} figures for {formatMonth(month)} aren't calculated yet; they appear the next time this month
            changes.
          </p>
        )}

        {view && totals && (
          <>
            <div>
              <MoneyLeftHero moneyLeft={totals.moneyLeft} goal={view.savingsGoalTarget} currency={currency} />
              <IncomeAllocation
                income={totals.income}
                spent={view.totalExpenses + view.fixedExpensesTotal}
                goal={view.savingsGoalTarget}
                currency={currency}
              />
            </div>

            <section aria-labelledby="income-heading">
              <SectionHeader
                id="income-heading"
                title="Income"
                aside={<span className="text-sm font-medium tabular-nums text-muted">{fmt(totals.income)}</span>}
              />
              <RowGroup className="mt-3">
                <ValueRow
                  leading={<IconTile letter="F" color="#F472B6" round />}
                  label="Filipa's salary"
                  description={FILIPA_SOURCE[view.filipaSalarySource]}
                  value={view.filipaSalarySource === "none" ? "—" : fmt(view.filipaSalary)}
                  to="/settings"
                />
                <ValueRow
                  leading={<IconTile letter="J" color="#60A5FA" round />}
                  label="João's salary"
                  description={settings?.joaoSalary ? "Fixed amount" : "Not set"}
                  value={fmt(view.joaoSalary)}
                  to="/settings"
                />
              </RowGroup>
            </section>

            <section aria-labelledby="spent-heading">
              <SectionHeader
                id="spent-heading"
                title="Money spent"
                aside={
                  <span className="text-sm font-medium tabular-nums text-muted">
                    {fmt(view.totalExpenses + view.fixedExpensesTotal)}
                  </span>
                }
              />
              <RowGroup className="mt-3">
                <ValueRow
                  leading={<IconTile icon={CreditCardIcon} color="#FF8A65" />}
                  label="Spending"
                  description={
                    pendingCount > 0 ? `Incl. ${pendingCount} pending` : "Card & bank payments"
                  }
                  value={fmt(view.totalExpenses)}
                  to="/transactions"
                />
                <ValueRow
                  leading={<IconTile icon={CalendarClockIcon} color="#A1A1AA" />}
                  label="Fixed bills"
                  description={fixedSpending.map((f) => f.label).join(", ") || "None yet"}
                  value={fmt(view.fixedExpensesTotal)}
                  to="/settings"
                />
              </RowGroup>
            </section>

            <section aria-labelledby="categories-heading">
              <SectionHeader
                id="categories-heading"
                title="Where it went"
                aside={
                  <Link to="/transactions" className="text-sm font-medium text-accent hover:underline">
                    All transactions
                  </Link>
                }
              />
              {byCategory.length === 0 ? (
                <p className="mt-3 rounded-2xl bg-surface px-4 py-6 text-center text-sm text-muted">
                  No spending recorded this month yet.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl bg-surface">
                  {byCategory.map(([id, amount]) => {
                    const fixedNames = fixedNamesIn(id);
                    const look = categoryLook(categoryById(id));
                    return (
                      <li key={id}>
                        <Link
                          // A category's transactions, in this month; fixed expenses without a category live in Settings.
                          to={id === UNCATEGORIZED_FIXED ? "/settings" : `/transactions?category=${encodeURIComponent(id)}`}
                          aria-label={`${categoryLabel(id)}, ${fmt(amount)}: see its transactions`}
                          className="flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-raised focus-visible:bg-raised focus-visible:outline-none"
                        >
                        <CategoryIcon category={categoryById(id)} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="truncate text-[15px] font-medium">{categoryLabel(id)}</span>
                            <span className="shrink-0 text-[15px] font-medium tabular-nums">{fmt(amount)}</span>
                          </div>
                          <div className="mt-2 flex items-center gap-3">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${(amount / maxCategory) * 100}%`, backgroundColor: look.color }}
                              />
                            </div>
                            {fixedNames.length > 0 && (
                              <span className="max-w-[45%] shrink-0 truncate text-right text-xs text-subtle">
                                incl. {fixedNames.join(", ")}
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRightIcon className="h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section aria-labelledby="investments-heading">
              <SectionHeader
                id="investments-heading"
                title="Investments"
                aside={
                  <span className="text-sm font-medium tabular-nums text-violet">{fmt(view.investmentsTotal ?? 0)}</span>
                }
                note="Kept apart: not counted in spending, money left or the goal."
              />
              {(view.investments?.length ?? 0) === 0 ? (
                <p className="mt-3 rounded-2xl bg-surface px-4 py-6 text-center text-sm text-muted">
                  Nothing moved to investments this month.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-line rounded-2xl bg-surface">
                  {view.investments!.map((item, i) => (
                    <li key={`${item.date}-${i}`} className="flex items-center gap-3 px-4 py-3">
                      <CategoryIcon category={categoryById(item.category)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium">{item.merchant}</span>
                        <span className="block truncate text-[13px] text-muted">
                          {item.fixed || !item.date ? "Every month" : formatShortDate(item.date)} · {categoryLabel(item.category)}
                        </span>
                      </span>
                      <span className="shrink-0 text-[15px] font-semibold tabular-nums text-violet">
                        {item.amount >= 0 ? fmt(item.amount) : `taken out ${fmt(-item.amount)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {month === currentMonth() && (
              <EstimatedSavings
                spentByCategory={byCategory}
                fixedCategoryIds={
                  new Set(fixedSpending.map((f) => (f.category && categoryById(f.category) ? f.category : UNCATEGORIZED_FIXED)))
                }
                income={totals.income}
                month={month}
                currency={currency}
                categoryById={categoryById}
                categoryLabel={categoryLabel}
              />
            )}
          </>
        )}
      </div>
    </>
  );
}
