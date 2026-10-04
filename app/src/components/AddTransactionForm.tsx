import { useState } from "react";
import { addManualTransaction } from "../lib/transactions";
import { CurrencySelect } from "./CurrencySelect";
import type { CategoryDef, DisplayCurrency } from "../types";

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Adds a transaction by hand, e.g. something paid from another account. */
export function AddTransactionForm({
  uid,
  categories,
  defaultCurrency,
  onAdded,
  onCancel,
}: {
  uid: string;
  categories: CategoryDef[];
  defaultCurrency: DisplayCurrency;
  /** Called with the month the new transaction belongs to. */
  onAdded: (month: string) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"out" | "in">("out");
  const [currency, setCurrency] = useState<DisplayCurrency>(defaultCurrency);
  const [category, setCategory] = useState(""); // "" = let the AI choose
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    const value = Number(amount);
    if (!description.trim()) return setError("Add a description, e.g. the shop or what it was for.");
    if (!amount || !Number.isFinite(value) || value <= 0) return setError("Enter an amount above 0.");
    if (!date) return setError("Pick a date.");
    setBusy(true);
    setError(null);
    try {
      const month = await addManualTransaction(uid, {
        date,
        merchantRaw: description.trim(),
        amount: direction === "out" ? -value : value,
        currency,
        category: category || null,
      });
      onAdded(month);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Add a transaction</h2>
      <p style={{ marginTop: 0, fontSize: 12, color: "var(--text-muted)" }}>
        For something paid or received outside the connected accounts. It counts on the Dashboard like any other.
      </p>

      <div className="field">
        <label>Description</label>
        <input type="text" value={description} placeholder="e.g. Dinner at Tasca do Chico" onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div className="field">
        <label>Amount</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={direction} onChange={(e) => setDirection(e.target.value as "out" | "in")} style={{ width: 112, flexShrink: 0 }}>
            <option value="out">Spent</option>
            <option value="in">Received</option>
          </select>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={amount}
            placeholder="0.00"
            onChange={(e) => setAmount(e.target.value)}
            style={{ flex: 1, minWidth: 70 }}
          />
          <CurrencySelect label="Transaction currency" value={currency} onChange={setCurrency} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div className="field" style={{ flex: "1 1 150px" }}>
          <label>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field" style={{ flex: "1 1 180px" }}>
          <label>Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Let the AI choose</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p style={{ color: "var(--status-critical)", fontSize: 13, marginTop: 0 }}>{error}</p>}

      <div style={{ display: "flex", gap: 10 }}>
        <button type="button" className="button" disabled={busy} onClick={handleSave}>
          {busy ? "Adding…" : "Add"}
        </button>
        <button type="button" className="button secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
