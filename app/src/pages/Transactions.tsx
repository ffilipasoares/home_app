import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import {
  deleteTransaction,
  subscribeAllTransactions,
  subscribeMonthTransactions,
  saveTransactionEdit,
} from "../lib/transactions";
import { subscribeAvailableMonths } from "../lib/dashboard";
import { subscribeCategories, subscribeUserSettings } from "../lib/settings";
import { useSelectedMonth } from "../lib/selectedMonth";
import { NO_FILTERS, amountShown, matches, sourceKey, type Filters } from "../lib/transactionFilters";
import { subscribeBankAccounts } from "../lib/bank";
import { MonthPicker } from "../components/MonthPicker";
import { AddTransactionForm } from "../components/AddTransactionForm";
import { formatCurrency } from "../lib/format";
import { ENTRY_CURRENCY } from "../types";
import type { AccountLink, CategoryDef, DisplayCurrency, Transaction } from "../types";

// Matches CONFIDENCE_THRESHOLD in functions/categorize.py: below it the
// AI's category is still applied, but marked so you know to double-check.
const AI_SURE_THRESHOLD = 0.7;

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
    <div className="card" style={{ borderColor: error ? "var(--status-warning)" : undefined }}>
      <p style={{ margin: 0 }}>
        {waiting.length} transaction{waiting.length === 1 ? " is" : "s are"} waiting for the AI to categorize{" "}
        {waiting.length === 1 ? "it" : "them"}. Anything that failed is retried automatically at the next sync (13:00 or 23:00).
      </p>
      {error && (
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 0 }}>Last error: {error}</p>
      )}
    </div>
  );
}

function TransactionRow({
  tx,
  categories,
  onSave,
  onDelete,
  displayCurrency,
}: {
  tx: Transaction;
  categories: CategoryDef[];
  /** Saves the category and/or budget month that changed. */
  onSave: (changes: { category?: string; month?: string }) => Promise<void>;
  onDelete: () => void;
  displayCurrency: DisplayCurrency;
}) {
  // The amount in the app currency (Settings), at this transaction's own date's rate.
  const shownAmount = tx.amountIn?.[displayCurrency] ?? (displayCurrency === "EUR" ? tx.amountHome : undefined);
  // Needs-review rows open ready to act on; an already-confirmed
  // transaction stays a quiet, compact summary line until you ask to
  // edit it — no controls competing for attention on every single row.
  // Opens by default only for an older AI suggestion awaiting confirmation;
  // a transaction still waiting for the AI needs nothing from you.
  const [expanded, setExpanded] = useState(tx.needsReview && !!tx.category);
  const [category, setCategory] = useState(tx.category ?? "");
  const [budgetMonth, setBudgetMonth] = useState(tx.month);
  const categoryDirty = category !== (tx.category ?? "");
  const monthDirty = budgetMonth !== tx.month;
  // Confirming an older AI suggestion counts as a change too.
  const saveCategory = !!category && (categoryDirty || tx.needsReview);
  const canSave = saveCategory || monthDirty;
  const [saving, setSaving] = useState(false);
  const categoryLabel = categories.find((c) => c.id === tx.category)?.label;

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({ category: saveCategory ? category : undefined, month: monthDirty ? budgetMonth : undefined });
      setExpanded(false);
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (confirm(`Delete this transaction (${tx.merchantRaw}, ${formatCurrency(tx.amount, tx.currency)})? This can't be undone.`)) {
      onDelete();
    }
  }

  return (
    <div className="tx-row" style={{ flexWrap: "wrap" }}>
      <div className="tx-main" style={{ flex: 1, minWidth: 0 }}>
        <div className="tx-merchant">
          {tx.merchantRaw}
          {tx.needsReview && !tx.internalTransfer && (
            <span className="badge" title={tx.aiError}>
              {tx.category ? "confirm suggestion" : tx.aiError ? "AI couldn't categorize yet" : "categorizing…"}
            </span>
          )}
          {tx.internalTransfer && <span className="badge">between your accounts · not counted</span>}
          {tx.pending && (
            <span className="badge" title="Not settled by the bank yet. The amount can still change; it updates on the next sync.">
              pending
            </span>
          )}
        </div>
        <div className="tx-date">
          {tx.date}
          {!expanded && categoryLabel && <> · {categoryLabel}</>}
          {tx.addedManually && <> · added by you</>}
          {tx.category && tx.source === "auto" && tx.confidence !== undefined && tx.confidence < AI_SURE_THRESHOLD && (
            <> · AI not sure ({(tx.confidence * 100).toFixed(0)}%)</>
          )}
        </div>
      </div>
      <div className={`tx-amount ${tx.amount >= 0 ? "positive" : "negative"}`}>
        {tx.currency === displayCurrency || shownAmount === undefined
          ? formatCurrency(tx.amount, tx.currency)
          : formatCurrency(shownAmount, displayCurrency)}
        {tx.currency !== displayCurrency && (
          <div style={{ fontSize: 11, fontWeight: 400, color: "var(--text-muted)" }}>
            {shownAmount !== undefined ? (
              <>original {formatCurrency(tx.amount, tx.currency)}</>
            ) : (
              <>{displayCurrency} amount pending</>
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        className="button secondary"
        style={{ padding: "4px 10px", fontSize: 12 }}
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? "Close" : "Edit"}
      </button>

      {expanded && (
        <div style={{ flex: "1 1 100%", marginTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
            <option value="" disabled>
              Choose category…
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <label style={{ fontSize: 12, color: "var(--text-muted)" }}>Counts toward</label>
            <input
              type="month"
              value={budgetMonth}
              onChange={(e) => setBudgetMonth(e.target.value)}
              style={{ width: 200, maxWidth: "100%" }}
              aria-label="Counts toward month"
            />
          </div>

          {/* Save is the main action, on the right; Delete is a quiet text button on the left. */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={handleDelete}
              style={{
                background: "none",
                border: "none",
                padding: "6px 0",
                font: "inherit",
                fontSize: 13,
                color: "var(--status-critical)",
                cursor: "pointer",
              }}
            >
              Delete
            </button>
            <button
              type="button"
              className="button"
              style={{ marginLeft: "auto", padding: "10px 22px" }}
              disabled={!canSave || saving}
              onClick={handleSave}
            >
              {saving ? "Saving…" : tx.needsReview && !categoryDirty && tx.category && !monthDirty ? "Confirm" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Transactions() {
  const { user } = useAuth();
  const uid = user!.uid;
  const { month, setMonth } = useSelectedMonth();
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<CategoryDef[]>([]);
  const [accounts, setAccounts] = useState<AccountLink[]>([]);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);

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
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>(ENTRY_CURRENCY);
  useEffect(() => subscribeUserSettings(uid, (s) => setDisplayCurrency(s.displayCurrency ?? ENTRY_CURRENCY)), [uid]);
  const [adding, setAdding] = useState(false);
  const [addedNote, setAddedNote] = useState(false);

  const visible = transactions.filter((tx) => matches(tx, filters, categories, displayCurrency));
  const filtering =
    filters.search.trim() !== "" || filters.category !== "all" || filters.direction !== "all" || filters.source !== "all";
  // Totals of what's shown, in the app currency; moves between your own accounts aren't counted.
  let spent = 0;
  let received = 0;
  for (const tx of visible) {
    const v = amountShown(tx, displayCurrency);
    if (v === undefined || tx.internalTransfer) continue;
    if (v < 0) spent -= v;
    else received += v;
  }

  // Sources that actually appear, for the "From" filter.
  const sourceOptions = Array.from(new Set(transactions.map(sourceKey))).map((key) => ({
    key,
    label:
      key === "manual"
        ? "Added by you"
        : key === "csv"
          ? "CSV import"
          : (accounts.find((a) => a.id === key)?.displayName ?? "Bank account"),
  }));
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <div className="screen">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={{ flex: 1 }}>Transactions</h1>
        {!adding && (
          <button type="button" className="button secondary" onClick={() => setAdding(true)}>
            + Add
          </button>
        )}
      </div>

      {adding && (
        <AddTransactionForm
          uid={uid}
          categories={categories}
          defaultCurrency={displayCurrency}
          onCancel={() => setAdding(false)}
          onAdded={(addedMonth) => {
            setAdding(false);
            setMonth(addedMonth);
            setAddedNote(true);
            setTimeout(() => setAddedNote(false), 3000);
          }}
        />
      )}
      {addedNote && <p style={{ color: "var(--status-good)", fontSize: 13 }}>Transaction added.</p>}

      <div className="field" style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {filters.allMonths ? (
            <select disabled aria-label="Month">
              <option>All months</option>
            </select>
          ) : (
            <MonthPicker month={month} availableMonths={availableMonths} onChange={setMonth} />
          )}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, whiteSpace: "nowrap" }}>
          <input type="checkbox" checked={filters.allMonths} onChange={(e) => set({ allMonths: e.target.checked })} />
          All months
        </label>
      </div>

      <div className="card" style={{ padding: 12 }}>
        <input
          type="search"
          value={filters.search}
          placeholder="Search name, category or amount"
          onChange={(e) => set({ search: e.target.value })}
          aria-label="Search transactions"
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <select value={filters.category} onChange={(e) => set({ category: e.target.value })} aria-label="Category" style={{ flex: "1 1 140px" }}>
            <option value="all">All categories</option>
            <option value="none">Not categorized</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <select
            value={filters.direction}
            onChange={(e) => set({ direction: e.target.value as Filters["direction"] })}
            aria-label="Spent or received"
            style={{ flex: "1 1 110px" }}
          >
            <option value="all">Spent &amp; received</option>
            <option value="out">Spent</option>
            <option value="in">Received</option>
          </select>
          <select value={filters.source} onChange={(e) => set({ source: e.target.value })} aria-label="From" style={{ flex: "1 1 140px" }}>
            <option value="all">All accounts</option>
            {sourceOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 12, color: "var(--text-muted)" }}>
          <span style={{ flex: 1 }}>
            {visible.length} transaction{visible.length === 1 ? "" : "s"} · spent {formatCurrency(spent, displayCurrency)} · received{" "}
            {formatCurrency(received, displayCurrency)}
          </span>
          {(filtering || filters.allMonths) && (
            <button type="button" className="button secondary" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setFilters(NO_FILTERS)}>
              Clear
            </button>
          )}
        </div>
      </div>

      {!filters.allMonths && <WaitingNote transactions={transactions} />}

      {visible.length === 0 && (
        <p className="empty-state">
          {transactions.length === 0 ? `No transactions for ${month}.` : "No transactions match these filters."}
        </p>
      )}

      {visible.length > 0 && (
        <div className="card">
          {visible.map((tx) => (
            <TransactionRow
              key={tx.id}
              tx={tx}
              categories={categories}
              displayCurrency={displayCurrency}
              onSave={(changes) => saveTransactionEdit(uid, tx.id, changes)}
              onDelete={() => deleteTransaction(uid, tx.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
