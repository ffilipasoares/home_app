import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import {
  resetCategoriesToDefaults,
  saveDisplayCurrency,
  saveCategories,
  saveUserSettings,
  subscribeCategories,
  subscribeUserSettings,
} from "../lib/settings";
import { FixedItemsEditor } from "../components/FixedItemsEditor";
import { BankConnectionCard } from "../components/BankConnectionCard";
import { CurrencySelect } from "../components/CurrencySelect";
import { ENTRY_CURRENCY } from "../types";
import type { CategoryDef, SavingsGoal, UserSettings } from "../types";

export function Settings() {
  const { user, signOut } = useAuth();
  const uid = user!.uid;

  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [categories, setCategories] = useState<CategoryDef[]>([]);
  // Which section's Save was just pressed, to show "Saved." next to that button only.
  const [savedSection, setSavedSection] = useState<string | null>(null);

  useEffect(() => subscribeUserSettings(uid, setSettings), [uid]);
  useEffect(() => subscribeCategories(uid, setCategories), [uid]);

  async function handleSave(section: string) {
    if (!settings) return;
    await saveUserSettings(uid, settings);
    setSavedSection(section);
    setTimeout(() => setSavedSection(null), 2000);
  }

  const saveButton = (section: string) => (
    <div style={{ marginTop: 16 }}>
      <button type="button" className="button" onClick={() => handleSave(section)}>
        Save
      </button>
      {savedSection === section && <span style={{ marginLeft: 12, color: "var(--status-good)" }}>Saved.</span>}
    </div>
  );

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

      <p className="empty-state" style={{ padding: "4px 0 16px", textAlign: "left" }}>
        Salary and any partner income/contribution now live on the <strong>Dashboard</strong>,
        per month — so scrolling back shows exactly what applied that month, not whatever
        this page currently says.
      </p>

      <BankConnectionCard uid={uid} />

      <div className="card">
        <h2>App currency</h2>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Show everything in</label>
          <CurrencySelect
            label="App currency"
            value={settings.displayCurrency ?? ENTRY_CURRENCY}
            onChange={(displayCurrency) => {
              setSettings({ ...settings, displayCurrency });
              saveDisplayCurrency(uid, displayCurrency);
            }}
          />
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 0 }}>
            The Dashboard and Transactions show every amount in this currency. Transactions in the other currency are
            converted at the rate for their own date; amounts you enter (salaries, savings goal, fixed expenses) at the
            month's rate. Saved straight away.
          </p>
        </div>
      </div>

      <div className="card">
        <h2>Salaries</h2>
        <div className="field">
          <label>Filipa's salary is paid in</label>
          <CurrencySelect
            label="Filipa's salary currency"
            value={settings.salaryCurrency ?? ENTRY_CURRENCY}
            onChange={(salaryCurrency) => setSettings({ ...settings, salaryCurrency })}
          />
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 0 }}>
            Detected from your transactions each month, or entered on the Dashboard.
          </p>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>João's salary</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="number"
              value={settings.joaoSalary?.amount ?? ""}
              placeholder="Not set"
              onChange={(e) =>
                setSettings({
                  ...settings,
                  joaoSalary:
                    e.target.value === ""
                      ? null
                      : { amount: Number(e.target.value), currency: settings.joaoSalary?.currency ?? ENTRY_CURRENCY },
                })
              }
              style={{ flex: 1, minWidth: 0 }}
            />
            <CurrencySelect
              label="João's salary currency"
              value={settings.joaoSalary?.currency ?? ENTRY_CURRENCY}
              onChange={(currency) =>
                setSettings({ ...settings, joaoSalary: { amount: settings.joaoSalary?.amount ?? 0, currency } })
              }
            />
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
            The amount and currency he's actually paid, used for every month.
          </p>
        </div>
        {saveButton("salaries")}
      </div>

      <div className="card">
        <h2>Savings goal</h2>
        <div className="field">
          <label>Savings goal type</label>
          <select value={settings.savingsGoal.type} onChange={(e) => updateGoal({ type: e.target.value as SavingsGoal["type"] })}>
            <option value="fixed">Fixed amount per month</option>
            <option value="percent">Percent of income</option>
          </select>
        </div>
        <div className="field">
          <label>{settings.savingsGoal.type === "fixed" ? "Amount" : "Percent (%)"}</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="number"
              value={settings.savingsGoal.value}
              onChange={(e) => updateGoal({ value: Number(e.target.value) })}
              style={{ flex: 1, minWidth: 0 }}
            />
            {settings.savingsGoal.type === "fixed" && (
              <CurrencySelect
                label="Savings goal currency"
                value={settings.savingsGoal.currency ?? ENTRY_CURRENCY}
                onChange={(currency) => updateGoal({ currency })}
              />
            )}
          </div>
        </div>

        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 0 }}>
          How much you want left at the end of each month. The Dashboard compares it with money left (income − spending
          − fixed expenses). A savings or investment category is spending like any other.
        </p>
        {saveButton("savings")}
      </div>

      <div className="card">
        <FixedItemsEditor
          title="Fixed monthly expenses"
          hint="Costs paid every month from another account, e.g. rent. They leave your money just the same, so they're subtracted from money left on the Dashboard, every month. If one changes, edit it here."
          items={settings.fixedExpenses}
          onChange={(fixedExpenses) => setSettings({ ...settings, fixedExpenses })}
        />
        {saveButton("fixed")}
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
