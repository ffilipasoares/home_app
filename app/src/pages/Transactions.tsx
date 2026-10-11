import { useEffect, useState } from "react";
import { PlusIcon, SearchIcon, SearchXIcon, SlidersHorizontalIcon, XIcon } from "lucide-react";
import { useAuth } from "../lib/auth";
import { subscribeAllTransactions, subscribeMonthTransactions } from "../lib/transactions";
import { subscribeAvailableMonths } from "../lib/dashboard";
import { subscribeCategories, subscribeUserSettings } from "../lib/settings";
import { useSelectedMonth } from "../lib/selectedMonth";
import { NO_FILTERS, amountShown, matches, sourceKey, type Filters } from "../lib/transactionFilters";
import { subscribeBankAccounts } from "../lib/bank";
import { formatMoney } from "../lib/format";
import { formatDayHeading, formatMonth } from "../lib/month";
import { PageHeader } from "../components/ui/PageHeader";
import { Button } from "../components/ui/Button";
import { Notice } from "../components/ui/ValueRow";
import { MonthSwitcher } from "../components/MonthSwitcher";
import { TransactionRow } from "../components/transactions/TransactionRow";
import { FilterSheet } from "../components/transactions/FilterSheet";
import { TransactionSheet } from "../components/transactions/TransactionSheet";
import { ENTRY_CURRENCY } from "../types";
import type { AccountLink, CategoryDef, DisplayCurrency, Transaction } from "../types";

/**
 * Categorization is automatic: each transaction is categorized as it
 * arrives, and anything that failed is retried by the scheduled sync
 * (functions/main.py, daily_bank_sync). This only explains what's
 * still waiting, and why, if the AI keeps failing.
 */
function WaitingNote({ transactions }: { transactions: Transaction[] }) {
  const waiting = transactions.filter((tx) => tx.needsReview && !tx.category && !tx.internalTransfer);
  if (waiting.length === 0) return null;
  const error = waiting.find((tx) => tx.aiError)?.aiError;
  return (
    <Notice tone={error ? "warning" : "muted"}>
      {waiting.length} transaction{waiting.length === 1 ? " is" : "s are"} waiting for the AI to categorize{" "}
      {waiting.length === 1 ? "it" : "them"}. Anything that failed is retried at the next sync (13:00 or 23:00).
      {error && <span className="mt-1 block text-[12px] text-muted">Last error: {error}</span>}
    </Notice>
  );
}

type DayGroup = { date: string; items: Transaction[]; total: number };

export function Transactions() {
  const { user } = useAuth();
  const uid = user!.uid;
  const { month, setMonth } = useSelectedMonth();
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<CategoryDef[]>([]);
  const [accounts, setAccounts] = useState<AccountLink[]>([]);
  const [currency, setCurrency] = useState<DisplayCurrency>(ENTRY_CURRENCY);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [addedNote, setAddedNote] = useState(false);

  useEffect(() => subscribeAvailableMonths(uid, setAvailableMonths), [uid]);
  useEffect(
    () =>
      filters.allMonths
        ? subscribeAllTransactions(uid, setTransactions)
        : subscribeMonthTransactions(uid, month, setTransactions),
    [uid, month, filters.allMonths],
  );
  useEffect(() => subscribeCategories(uid, setCategories), [uid]);
  useEffect(() => subscribeBankAccounts(uid, setAccounts), [uid]);
  useEffect(() => subscribeUserSettings(uid, (s) => setCurrency(s.displayCurrency ?? ENTRY_CURRENCY)), [uid]);

  const categoryOf = (tx: Transaction) => categories.find((c) => c.id === tx.category);
  const sourceLabel = (tx: Transaction) => {
    const key = sourceKey(tx);
    if (key === "manual") return "Added by you";
    if (key === "csv") return "CSV import";
    return accounts.find((a) => a.id === key)?.displayName ?? "Bank account";
  };
  // Sources that actually appear, for the Account filter.
  const sourceOptions = Array.from(new Map(transactions.map((tx) => [sourceKey(tx), sourceLabel(tx)])).entries()).map(
    ([key, label]) => ({ key, label }),
  );

  const visible = transactions.filter((tx) => matches(tx, filters, categories, currency));
  const activeFilterCount =
    (filters.category !== "all" ? 1 : 0) +
    (filters.direction !== "all" ? 1 : 0) +
    (filters.source !== "all" ? 1 : 0) +
    (filters.allMonths ? 1 : 0);

  // Totals of what's shown, in the app currency; moves between your own accounts aren't counted.
  const counted = (tx: Transaction) => (tx.internalTransfer ? undefined : amountShown(tx, currency));
  let spent = 0;
  let received = 0;
  for (const tx of visible) {
    const v = counted(tx);
    if (v === undefined) continue;
    if (v < 0) spent -= v;
    else received += v;
  }

  const groupsByDate = new Map<string, DayGroup>();
  for (const tx of visible) {
    const group = groupsByDate.get(tx.date) ?? { date: tx.date, items: [], total: 0 };
    group.items.push(tx);
    group.total += counted(tx) ?? 0;
    groupsByDate.set(tx.date, group);
  }
  const groups = Array.from(groupsByDate.values()).sort((a, b) => b.date.localeCompare(a.date));

  // The live copy while it exists; the one opened, while the sheet closes after a delete.
  const editing = editingTx ? (transactions.find((t) => t.id === editingTx.id) ?? editingTx) : null;
  const openEditor = (tx: Transaction | null) => {
    setEditingTx(tx);
    setEditorOpen(true);
  };
  const reset = () => setFilters(NO_FILTERS);

  return (
    <>
      <PageHeader
        title="Transactions"
        action={
          <button
            type="button"
            onClick={() => openEditor(null)}
            aria-label="Add transaction"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-canvas transition-[transform,background-color] duration-150 ease-out hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas active:scale-95"
          >
            <PlusIcon className="h-5 w-5" />
          </button>
        }
      />

      <div className="sticky top-0 z-30 space-y-3 bg-canvas/95 px-5 pb-3 pt-1 backdrop-blur">
        <div className="flex gap-2">
          <div className="flex h-11 flex-1 items-center gap-2 rounded-xl bg-surface px-3 focus-within:ring-2 focus-within:ring-accent">
            <SearchIcon className="h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />
            <input
              type="search"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              placeholder="Search name, category or amount"
              aria-label="Search transactions"
              className="w-full bg-transparent text-[15px] text-ink placeholder:text-subtle focus:outline-none [&::-webkit-search-cancel-button]:hidden"
            />
            {filters.search && (
              <button
                type="button"
                onClick={() => setFilters({ ...filters, search: "" })}
                aria-label="Clear search"
                className="text-subtle hover:text-ink"
              >
                <XIcon className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            aria-label={`Filters${activeFilterCount ? `, ${activeFilterCount} active` : ""}`}
            className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              activeFilterCount ? "bg-ink text-canvas" : "bg-surface text-muted hover:text-ink"
            }`}
          >
            <SlidersHorizontalIcon className="h-[18px] w-[18px]" />
            {activeFilterCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-canvas">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center justify-between gap-3">
          {filters.allMonths ? (
            <button
              type="button"
              onClick={() => setFilters({ ...filters, allMonths: false })}
              className="flex h-9 items-center gap-1.5 rounded-full bg-surface pl-3.5 pr-2.5 text-sm font-semibold"
            >
              All months <XIcon className="h-3.5 w-3.5 text-subtle" aria-hidden="true" />
              <span className="sr-only">— show one month</span>
            </button>
          ) : (
            <div className="-ml-2">
              <MonthSwitcher
                variant="compact"
                firstMonth={availableMonths.length ? availableMonths[availableMonths.length - 1] : undefined}
              />
            </div>
          )}
          <p className="text-right text-[13px] leading-tight tabular-nums text-muted">
            <span className="text-ink">{formatMoney(-spent, currency)}</span> out
            <br />
            <span className="text-positive">{formatMoney(received, currency, { signed: true })}</span> in
          </p>
        </div>
      </div>

      <div className="space-y-4 px-5 pb-8 pt-2">
        {addedNote && (
          <p role="status" className="rounded-2xl bg-accent/15 px-4 py-3 text-sm font-medium text-positive">
            Transaction added.
          </p>
        )}
        {!filters.allMonths && <WaitingNote transactions={transactions} />}

        {groups.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <SearchXIcon className="h-8 w-8 text-subtle" aria-hidden="true" />
            {transactions.length === 0 ? (
              <p className="mt-4 text-[15px] font-medium">No transactions in {formatMonth(month)}</p>
            ) : (
              <>
                <p className="mt-4 text-[15px] font-medium">No transactions match</p>
                <p className="mt-1 text-sm text-muted">Try a different search or loosen your filters.</p>
                <Button variant="secondary" className="mt-5 h-10" onClick={reset}>
                  Clear search &amp; filters
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.date} aria-label={formatDayHeading(group.date)}>
                <div className="flex items-baseline justify-between px-1 pb-2">
                  <h2 className="font-sans text-[13px] font-semibold text-muted">{formatDayHeading(group.date)}</h2>
                  <span className="text-[13px] tabular-nums text-subtle">
                    {formatMoney(group.total, currency, { signed: true })}
                  </span>
                </div>
                <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface">
                  {group.items.map((tx) => (
                    <li key={tx.id}>
                      <TransactionRow tx={tx} category={categoryOf(tx)} currency={currency} onSelect={openEditor} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <p className="pt-2 text-center text-[13px] text-subtle">
              {visible.length} {visible.length === 1 ? "transaction" : "transactions"}
            </p>
          </div>
        )}
      </div>

      <FilterSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        onChange={setFilters}
        onReset={reset}
        resultCount={visible.length}
        categories={categories}
        sourceOptions={sourceOptions}
      />
      <TransactionSheet
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        uid={uid}
        transaction={editing}
        categories={categories}
        currency={currency}
        sourceLabel={sourceLabel}
        onAdded={(addedMonth) => {
          setMonth(addedMonth);
          setAddedNote(true);
          setTimeout(() => setAddedNote(false), 3000);
        }}
      />
    </>
  );
}
