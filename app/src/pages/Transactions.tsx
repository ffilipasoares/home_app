import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { subscribeMonthTransactions, updateTransactionCategory } from "../lib/transactions";
import { subscribeAvailableMonths } from "../lib/dashboard";
import { subscribeCategories } from "../lib/settings";
import { currentMonth } from "../lib/month";
import { MonthPicker } from "../components/MonthPicker";
import { formatCurrency } from "../lib/format";
import type { CategoryDef, Transaction } from "../types";

function TransactionRow({
  tx,
  categories,
  onSave,
}: {
  tx: Transaction;
  categories: CategoryDef[];
  onSave: (category: string) => void;
}) {
  const [category, setCategory] = useState(tx.category ?? "");
  const dirty = category !== (tx.category ?? "");

  return (
    <div className="tx-row" style={{ flexWrap: "wrap" }}>
      <div className="tx-main" style={{ flex: "1 1 100%" }}>
        <div className="tx-merchant">
          {tx.merchantRaw}
          {tx.needsReview && <span className="badge">needs review</span>}
        </div>
        <div className="tx-date">{tx.date}</div>
      </div>
      <div className={`tx-amount ${tx.amount >= 0 ? "positive" : "negative"}`}>{formatCurrency(tx.amount)}</div>
      <div style={{ display: "flex", gap: 8, flex: "1 1 100%", marginTop: 4 }}>
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
          disabled={!category || !dirty}
          onClick={() => onSave(category)}
        >
          Save
        </button>
      </div>
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
            onSave={(category) => updateTransactionCategory(uid, tx.id, category)}
          />
        ))}
      </div>
    </div>
  );
}
