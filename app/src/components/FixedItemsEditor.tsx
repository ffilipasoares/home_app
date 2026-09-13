import type { FixedLineItem } from "../types";

export function FixedItemsEditor({
  title,
  hint,
  items,
  onChange,
}: {
  title: string;
  hint: string;
  items: FixedLineItem[];
  onChange: (items: FixedLineItem[]) => void;
}) {
  function update(id: string, patch: Partial<FixedLineItem>) {
    onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
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
      {items.map((item) => (
        <div key={item.id} className="tx-row">
          <input
            type="text"
            placeholder="Label"
            value={item.label}
            onChange={(e) => update(item.id, { label: e.target.value })}
            style={{ flex: 1 }}
          />
          <input
            type="number"
            value={item.amount}
            onChange={(e) => update(item.id, { amount: Number(e.target.value) })}
            style={{ width: 110 }}
          />
          <button type="button" className="button secondary" style={{ padding: "6px 10px" }} onClick={() => remove(item.id)}>
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="button secondary" style={{ marginTop: 10 }} onClick={add}>
        Add item
      </button>
    </>
  );
}
