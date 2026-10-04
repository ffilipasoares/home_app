import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import {
  deleteTransaction,
  subscribeMonthTransactions,
  updateTransactionCategory,
  updateTransactionMonth,
} from "../lib/transactions";
import { subscribeAvailableMonths } from "../lib/dashboard";
import { subscribeCategories, subscribeUserSettings } from "../lib/settings";
import { currentMonth } from "../lib/month";
import { MonthPicker } from "../components/MonthPicker";
import { formatCurrency } from "../lib/format";
import { ENTRY_CURRENCY } from "../types";
import type { CategoryDef, DisplayCurrency, Transaction } from "../types";

// Matches CONFIDENCE_THRESHOLD in functions/categorize.py: below it the
// AI's category is still applied, but marked so you know to double-check.
const AI_SURE_THRESHOLD = 0.7;

/**
 * Categorization is automatic: each transaction is categorized as it
 * arrives, and anything that failed is retried by the nightly job
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
        {waiting.length === 1 ? "it" : "them"}. Anything that failed is retried automatically tonight.
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
  onSaveCategory,
  onMove,
  onDelete,
  displayCurrency,
}: {
  tx: Transaction;
  categories: CategoryDef[];
  onSaveCategory: (category: string) => void;
  onMove: (month: string) => void;
  onDelete: () => void;
  displayCurrency: DisplayCurrency;
}) {
  // The amount in the currency chosen on the Dashboard, at this transaction's own date's rate.
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
  const canSaveCategory = !!category && (categoryDirty || tx.needsReview);
  const categoryLabel = categories.find((c) => c.id === tx.category)?.label;

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
        </div>
        <div className="tx-date">
          {tx.date}
          {!expanded && categoryLabel && <> · {categoryLabel}</>}
          {tx.category && tx.source === "auto" && tx.confidence !== undefined && tx.confidence < AI_SURE_THRESHOLD && (
            <> · AI not sure ({(tx.confidence * 100).toFixed(0)}%)</>
          )}
        </div>
      </div>
      <div className={`tx-amount ${tx.amount >= 0 ? "positive" : "negative"}`}>
        {formatCurrency(tx.amount, tx.currency)}
        {tx.currency !== displayCurrency && (
          <div style={{ fontSize: 11, fontWeight: 400, color: "var(--text-muted)" }}>
            {shownAmount !== undefined ? <>→ {formatCurrency(shownAmount, displayCurrency)}</> : <>{displayCurrency} pending</>}
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
        <div style={{ flex: "1 1 100%", marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="" disabled>
                Choose category…
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="button"
              style={{ padding: "8px 14px" }}
              disabled={!canSaveCategory}
              onClick={() => onSaveCategory(category)}
            >
              {tx.needsReview && !categoryDirty && tx.category ? "Confirm" : "Save"}
            </button>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, color: "var(--text-muted)" }}>Counts toward</label>
            <input type="month" value={budgetMonth} onChange={(e) => setBudgetMonth(e.target.value)} style={{ width: 140 }} />
            <button
              type="button"
              className="button secondary"
              style={{ padding: "6px 12px" }}
              disabled={!monthDirty}
              onClick={() => onMove(budgetMonth)}
            >
              Move
            </button>
            <button
              type="button"
              className="button secondary"
              style={{ padding: "6px 12px", marginLeft: "auto", color: "var(--status-critical)" }}
              onClick={handleDelete}
            >
              Delete
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
  const [month, setMonth] = useState(currentMonth());
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<CategoryDef[]>([]);

  useEffect(() => subscribeAvailableMonths(uid, setAvailableMonths), [uid]);
  useEffect(() => subscribeMonthTransactions(uid, month, setTransactions), [uid, month]);
  useEffect(() => subscribeCategories(uid, setCategories), [uid]);
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>(ENTRY_CURRENCY);
  useEffect(() => subscribeUserSettings(uid, (s) => setDisplayCurrency(s.displayCurrency ?? ENTRY_CURRENCY)), [uid]);

  return (
    <div className="screen">
      <h1>Transactions</h1>
      <div className="field">
        <MonthPicker month={month} availableMonths={availableMonths} onChange={setMonth} />
      </div>

      <WaitingNote transactions={transactions} />

      {transactions.length === 0 && <p className="empty-state">No transactions for {month}.</p>}

      <div className="card">
        {transactions.map((tx) => (
          <TransactionRow
            key={tx.id}
            tx={tx}
            categories={categories}
            displayCurrency={displayCurrency}
            onSaveCategory={(category) => updateTransactionCategory(uid, tx.id, category)}
            onMove={(newMonth) => updateTransactionMonth(uid, tx.id, newMonth)}
            onDelete={() => deleteTransaction(uid, tx.id)}
          />
        ))}
      </div>
    </div>
  );
}
