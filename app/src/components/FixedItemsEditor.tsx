import { AmountInput } from "./AmountInput";
import { CurrencySelect } from "./CurrencySelect";
import { ENTRY_CURRENCY, type CategoryDef, type FixedLineItem } from "../types";

/** The item without a category, so the AI picks one again (Firestore rejects `undefined` fields, so the keys go). */
function withoutCategory({ category: _category, categorySource: _source, ...rest }: FixedLineItem): FixedLineItem {
  return rest;
}

export function FixedItemsEditor({
  title,
  hint,
  items,
  categories,
  onChange,
}: {
  title: string;
  hint: string;
  items: FixedLineItem[];
  categories: CategoryDef[];
  onChange: (items: FixedLineItem[]) => void;
}) {
  // A fixed expense is money going out, never salary.
  const choices = categories.filter((c) => c.special !== "income");

  function replace(id: string, next: (item: FixedLineItem) => FixedLineItem) {
    onChange(items.map((i) => (i.id === id ? next(i) : i)));
  }
  function update(id: string, patch: Partial<FixedLineItem>) {
    replace(id, (i) => ({ ...i, ...patch }));
  }
  function rename(id: string, label: string) {
    // A category the AI picked was for the old name; let it pick again. One you chose stays.
    replace(id, (i) => (i.categorySource === "user" ? { ...i, label } : { ...withoutCategory(i), label }));
  }
  function setCategory(id: string, category: string) {
    replace(id, (i) => (category ? { ...i, category, categorySource: "user" } : withoutCategory(i)));
  }
  function add() {
    onChange([...items, { id: `item_${Date.now().toString(36)}`, label: "", amount: 0 }]);
  }
  function remove(id: string) {
    onChange(items.filter((i) => i.id !== id));
  }

  return (
    <>
      <h2>{title}</h2>
      <p style={{ marginTop: 0, color: "var(--text-secondary)", fontSize: 13 }}>{hint}</p>
      {items.map((item) => {
        const known = item.category && categories.some((c) => c.id === item.category);
        return (
          <div key={item.id} className="tx-row" style={{ flexWrap: "wrap", rowGap: 8 }}>
            <input
              type="text"
              placeholder="Label"
              value={item.label}
              onChange={(e) => rename(item.id, e.target.value)}
              style={{ flex: 1, minWidth: 120 }}
            />
            <AmountInput
              label={`Amount for ${item.label || "this expense"}`}
              value={item.amount}
              onChange={(amount) => update(item.id, { amount: amount ?? 0 })}
              style={{ width: 110 }}
            />
            <CurrencySelect value={item.currency ?? ENTRY_CURRENCY} onChange={(currency) => update(item.id, { currency })} />
            <button type="button" className="button secondary" style={{ padding: "6px 10px" }} onClick={() => remove(item.id)}>
              ✕
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexBasis: "100%" }}>
              <select
                aria-label={`Category for ${item.label || "this expense"}`}
                value={known ? item.category : ""}
                onChange={(e) => setCategory(item.id, e.target.value)}
                style={{ flex: 1, minWidth: 0 }}
              >
                <option value="">{item.category && !known ? "Category removed, pick one" : "Category: AI picks"}</option>
                {choices.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              {known && item.categorySource === "auto" && (
                <span style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>picked by AI</span>
              )}
            </div>
          </div>
        );
      })}
      <button type="button" className="button secondary" style={{ marginTop: 10 }} onClick={add}>
        Add item
      </button>
    </>
  );
}
