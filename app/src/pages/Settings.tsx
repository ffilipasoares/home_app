import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { saveCategories, saveUserSettings, subscribeCategories, subscribeUserSettings } from "../lib/settings";
import type { CategoryDef, SavingsGoal, UserSettings } from "../types";

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
    setCategories((cats) => [...cats, { id, label, needed: false }]);
  }

  function removeCategory(id: string) {
    setCategories((cats) => cats.filter((c) => c.id !== id));
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
        <h2>Salary & savings goal</h2>
        <div className="field">
          <label>Default monthly salary (used when no income transaction is detected)</label>
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
            <option value="percent">Percent of salary</option>
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
        <button type="button" className="button" onClick={handleSaveProfile}>
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
            <select
              value={c.needed ? "yes" : "no"}
              onChange={(e) => updateCategory(c.id, { needed: e.target.value === "yes" })}
              style={{ width: 140 }}
            >
              <option value="yes">Needed</option>
              <option value="no">Discretionary</option>
            </select>
            <button type="button" className="button secondary" style={{ padding: "6px 10px" }} onClick={() => removeCategory(c.id)}>
              ✕
            </button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button type="button" className="button secondary" onClick={addCategory}>
            Add category
          </button>
          <button type="button" className="button" onClick={() => saveCategories(uid, categories)}>
            Save categories
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
