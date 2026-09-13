import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import {
  deleteTransaction,
  subscribeMonthTransactions,
  updateTransactionCategory,
  updateTransactionMonth,
} from "../lib/transactions";
import { subscribeAvailableMonths } from "../lib/dashboard";
import { subscribeCategories } from "../lib/settings";
import { currentMonth } from "../lib/month";
import { MonthPicker } from "../components/MonthPicker";
import { formatCurrency } from "../lib/format";
import type { CategoryDef, Transaction } from "../types";

function TransactionRow({
  tx,
  categories,
  onSaveCategory,
  onMove,
  onDelete,
}: {
  tx: Transaction;
  categories: CategoryDef[];
  onSaveCategory: (category: string) => void;
  onMove: (month: string) => void;
  onDelete: () => void;
}) {
  // Needs-review rows open ready to act on; an already-confirmed
  // transaction stays a quiet, compact summary line until you ask to
  // edit it — no controls competing for attention on every single row.
  const [expanded, setExpanded] = useState(tx.needsReview);
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
          {tx.needsReview && (
            <span className="badge">{tx.category && tx.source === "auto" ? "confirm suggestion" : "needs review"}</span>
          )}
        </div>
        <div className="tx-date">
          {tx.date}
          {!expanded && categoryLabel && <> · {categoryLabel}</>}
          {tx.category && tx.needsReview && tx.confidence !== undefined && (
            <> · AI guess, {(tx.confidence * 100).toFixed(0)}% confident</>
          )}
        </div>
      </div>
      <div className={`tx-amount ${tx.amount >= 0 ? "positive" : "negative"}`}>
        {formatCurrency(tx.amount, tx.currency)}
        {tx.amountHome !== undefined && tx.currency !== "EUR" && (
          <div style={{ fontSize: 11, fontWeight: 400, color: "var(--text-muted)" }}>
            → {formatCurrency(tx.amountHome)}
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

  return (
    <div className="screen">
      <h1>Transactions</h1>
      <div className="field">
        <MonthPicker month={month} availableMonths={availableMonths} onChange={setMonth} />
      </div>

      {transactions.length === 0 && <p className="empty-state">No transactions for {month}.</p>}

      <div className="card">
        {transactions.map((tx) => (
          <TransactionRow
            key={tx.id}
            tx={tx}
            categories={categories}
            onSaveCategory={(category) => updateTransactionCategory(uid, tx.id, category)}
            onMove={(newMonth) => updateTransactionMonth(uid, tx.id, newMonth)}
            onDelete={() => deleteTransaction(uid, tx.id)}
          />
        ))}
      </div>
    </div>
  );
}
