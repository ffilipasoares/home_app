import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import {
  resetCategoriesToDefaults,
  saveCategories,
  saveUserSettings,
  subscribeCategories,
  subscribeUserSettings,
} from "../lib/settings";
import type { CategoryDef, FixedLineItem, SavingsGoal, UserSettings } from "../types";

function FixedItemsEditor({
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
            placeholder="Label (e.g. Rent)"
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

export function Settings() {
  const { user, signOut } = useAuth();
  const uid = user!.uid;

  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [categories, setCategories] = useState<CategoryDef[]>([]);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  useEffect(() => subscribeUserSettings(uid, setSettings), [uid]);
  useEffect(() => subscribeCategories(uid, setCategories), [uid]);

  async function handleSaveProfile() {
    if (!settings) return;
    await saveUserSettings(uid, settings);
    setSavedNote("Saved.");
    setTimeout(() => setSavedNote(null), 2000);
  }

  function updateGoal(patch: Partial<SavingsGoal>) {
    if (!settings) return;
    setSettings({ ...settings, savingsGoal: { ...settings.savingsGoal, ...patch } });
  }

  function updateCategory(id: string, patch: Partial<CategoryDef>) {
    setCategories((cats) => cats.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function addCategory() {
    const label = prompt("New category name?");
    if (!label) return;
    const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    if (!id || categories.some((c) => c.id === id)) return;
    setCategories((cats) => [...cats, { id, label }]);
  }

  function removeCategory(id: string) {
    setCategories((cats) => cats.filter((c) => c.id !== id));
  }

  async function handleReset() {
    if (!confirm("Replace your current category list with the defaults (Salary, Food, Transport, Needs, Invest, Entertainment, Others)? This doesn't touch already-categorized transactions, but any category not in that list will stop matching them.")) return;
    await resetCategoriesToDefaults(uid);
  }

  if (!settings) {
    return (
      <div className="screen">
        <p className="empty-state">Loading…</p>
      </div>
    );
  }

  return (
    <div className="screen">
      <h1>Settings</h1>

      <div className="card">
        <h2>Salary &amp; savings goal</h2>
        <div className="field">
          <label>Default salary (used when no "Salary"-category transaction is found this month)</label>
          <input
            type="number"
            value={settings.defaultSalary}
            onChange={(e) => setSettings({ ...settings, defaultSalary: Number(e.target.value) })}
          />
        </div>
        <div className="field">
          <label>Savings goal type</label>
          <select value={settings.savingsGoal.type} onChange={(e) => updateGoal({ type: e.target.value as SavingsGoal["type"] })}>
            <option value="fixed">Fixed € amount per month</option>
            <option value="percent">Percent of income</option>
          </select>
        </div>
        <div className="field">
          <label>{settings.savingsGoal.type === "fixed" ? "Amount (€)" : "Percent (%)"}</label>
          <input
            type="number"
            value={settings.savingsGoal.value}
            onChange={(e) => updateGoal({ value: Number(e.target.value) })}
          />
        </div>

        <FixedItemsEditor
          title="Fixed monthly expenses"
          hint="For costs that never show up as a transaction in this account — e.g. rent paid from a different account."
          items={settings.fixedExpenses}
          onChange={(fixedExpenses) => setSettings({ ...settings, fixedExpenses })}
        />

        <div style={{ marginTop: 20 }}>
          <FixedItemsEditor
            title="Fixed monthly incomes"
            hint="For household income that doesn't land in this account — e.g. a partner's salary or contribution you still want counted."
            items={settings.fixedIncomes}
            onChange={(fixedIncomes) => setSettings({ ...settings, fixedIncomes })}
          />
        </div>

        <button type="button" className="button" style={{ marginTop: 20 }} onClick={handleSaveProfile}>
          Save
        </button>
        {savedNote && <span style={{ marginLeft: 12, color: "var(--status-good)" }}>{savedNote}</span>}
      </div>

      <div className="card">
        <h2>Categories</h2>
        {categories.map((c) => (
          <div key={c.id} className="tx-row">
            <input
              type="text"
              value={c.label}
              onChange={(e) => updateCategory(c.id, { label: e.target.value })}
              style={{ flex: 1 }}
            />
            <button type="button" className="button secondary" style={{ padding: "6px 10px" }} onClick={() => removeCategory(c.id)}>
              ✕
            </button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <button type="button" className="button secondary" onClick={addCategory}>
            Add category
          </button>
          <button type="button" className="button" onClick={() => saveCategories(uid, categories)}>
            Save categories
          </button>
          <button type="button" className="button secondary" onClick={handleReset}>
            Reset to defaults
          </button>
        </div>
      </div>

      <div className="card">
        <button type="button" className="button secondary" onClick={() => signOut()}>
          Sign out
        </button>
      </div>
    </div>
  );
}
