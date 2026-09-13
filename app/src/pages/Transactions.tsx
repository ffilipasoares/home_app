import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { subscribeMonthTransactions, updateTransactionCategory, updateTransactionMonth } from "../lib/transactions";
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
}: {
  tx: Transaction;
  categories: CategoryDef[];
  onSaveCategory: (category: string) => void;
  onMove: (month: string) => void;
}) {
  const [category, setCategory] = useState(tx.category ?? "");
  const [budgetMonth, setBudgetMonth] = useState(tx.month);
  const categoryDirty = category !== (tx.category ?? "");
  const monthDirty = budgetMonth !== tx.month;
  // An AI suggestion pre-fills `category` but leaves needsReview true — Save
  // should still confirm it in one tap without requiring you to change the
  // dropdown first just to make it "dirty".
  const canSaveCategory = !!category && (categoryDirty || tx.needsReview);

  return (
    <div className="tx-row" style={{ flexWrap: "wrap" }}>
      <div className="tx-main" style={{ flex: "1 1 100%" }}>
        <div className="tx-merchant">
          {tx.merchantRaw}
          {tx.needsReview && (
            <span className="badge">
              {tx.category && tx.source === "auto" ? "confirm suggestion" : "needs review"}
            </span>
          )}
        </div>
        <div className="tx-date">
          {tx.date}
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
      <div style={{ display: "flex", gap: 8, flex: "1 1 100%", marginTop: 4, flexWrap: "wrap" }}>
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
      <details style={{ flex: "1 1 100%", marginTop: 2 }}>
        <summary style={{ fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}>
          Counts toward {tx.month} — move to a different month?
        </summary>
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <input type="month" value={budgetMonth} onChange={(e) => setBudgetMonth(e.target.value)} />
          <button
            type="button"
            className="button secondary"
            style={{ padding: "8px 14px" }}
            disabled={!monthDirty}
            onClick={() => onMove(budgetMonth)}
          >
            Move
          </button>
        </div>
      </details>
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
          />
        ))}
      </div>
    </div>
  );
}
