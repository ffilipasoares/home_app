import { useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { BottomSheet, SheetBody } from "../ui/BottomSheet";
import { FieldError } from "../ui/fields";
import { CURRENCY_OPTIONS } from "../ui/styles";
import { CancelSave } from "./CancelSave";
import { useSave } from "../../lib/useSave";
import { formatAmountInput, parseAmount } from "../../lib/amount";
import { saveUserSettings } from "../../lib/settings";
import { ENTRY_CURRENCY, type CategoryDef, type DisplayCurrency, type FixedLineItem } from "../../types";

type Draft = {
  id: string;
  label: string;
  amount: string;
  currency: DisplayCurrency;
  /** "" = let the AI choose. */
  category: string;
  categorySource?: "auto" | "user";
};

const FIELD =
  "h-11 rounded-lg border border-line bg-surface px-3 text-[15px] text-ink placeholder:text-subtle focus:border-accent focus:outline-none";

export function FixedExpensesSheet({
  open,
  onClose,
  uid,
  items,
  categories,
  defaultCurrency,
}: {
  open: boolean;
  onClose: () => void;
  uid: string;
  items: FixedLineItem[];
  categories: CategoryDef[];
  /** Currency a new item starts in: the app currency. */
  defaultCurrency: DisplayCurrency;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Fixed monthly expenses">
      <FixedForm onClose={onClose} uid={uid} items={items} categories={categories} defaultCurrency={defaultCurrency} />
    </BottomSheet>
  );
}

function FixedForm({
  onClose,
  uid,
  items,
  categories,
  defaultCurrency,
}: {
  onClose: () => void;
  uid: string;
  items: FixedLineItem[];
  categories: CategoryDef[];
  defaultCurrency: DisplayCurrency;
}) {
  const [drafts, setDrafts] = useState<Draft[]>(
    items.map((f) => ({
      id: f.id,
      label: f.label,
      amount: formatAmountInput(f.amount),
      currency: f.currency ?? ENTRY_CURRENCY,
      category: f.category ?? "",
      categorySource: f.categorySource,
    })),
  );
  const [invalid, setInvalid] = useState<string>();
  const { busy, error, save } = useSave(onClose);
  // A fixed expense is money going out, never salary.
  const choices = categories.filter((c) => c.special !== "income");

  const update = (id: string, next: (d: Draft) => Draft) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? next(d) : d)));
    setInvalid(undefined);
  };

  function handleSave() {
    const rows = drafts.filter((d) => d.label.trim() || d.amount.trim());
    const parsed = rows.map((d) => ({ ...d, value: parseAmount(d.amount) }));
    if (parsed.some((d) => !d.label.trim() || d.value === null || d.value === undefined || d.value < 0)) {
      setInvalid("Each expense needs a name and an amount, e.g. 2100,00.");
      return;
    }
    // Firestore rejects undefined fields, so an item the AI should categorize has no category keys at all.
    const next: FixedLineItem[] = parsed.map((d) => ({
      id: d.id,
      label: d.label.trim(),
      amount: d.value ?? 0,
      currency: d.currency,
      ...(d.category ? { category: d.category, categorySource: d.categorySource ?? "user" } : {}),
    }));
    save(() => saveUserSettings(uid, { fixedExpenses: next }));
  }

  return (
    <>
      <SheetBody className="space-y-0">
        <p className="text-sm text-muted">
          Costs paid every month from another account, like rent. They come off money left every month and count in
          their category. An investments category puts them in Investments instead.
        </p>

        <ul className="mt-4 space-y-3">
          {drafts.map((d) => {
            const known = d.category && categories.some((c) => c.id === d.category);
            return (
              <li key={d.id} className="rounded-xl bg-raised p-3">
                <div className="flex gap-2">
                  <input
                    value={d.label}
                    onChange={(e) =>
                      update(d.id, (x) =>
                        // A category the AI picked was for the old name; let it pick again. One you chose stays.
                        x.categorySource === "user"
                          ? { ...x, label: e.target.value }
                          : { ...x, label: e.target.value, category: "", categorySource: undefined },
                      )
                    }
                    aria-label="Expense name"
                    placeholder="Name, e.g. Rent"
                    className={`${FIELD} min-w-0 flex-1`}
                  />
                  <button
                    type="button"
                    onClick={() => setDrafts((prev) => prev.filter((x) => x.id !== d.id))}
                    aria-label={`Remove ${d.label || "expense"}`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-surface hover:text-negative"
                  >
                    <Trash2Icon className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={d.amount}
                    onChange={(e) => update(d.id, (x) => ({ ...x, amount: e.target.value }))}
                    inputMode="decimal"
                    autoComplete="off"
                    aria-label={`${d.label || "Expense"} amount`}
                    placeholder="0,00"
                    className={`${FIELD} w-0 flex-1 tabular-nums`}
                  />
                  <select
                    value={d.currency}
                    onChange={(e) => update(d.id, (x) => ({ ...x, currency: e.target.value as DisplayCurrency }))}
                    aria-label={`${d.label || "Expense"} currency`}
                    className={`${FIELD} w-[96px] font-semibold`}
                  >
                    {CURRENCY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <select
                  value={known ? d.category : ""}
                  onChange={(e) =>
                    update(d.id, (x) =>
                      e.target.value
                        ? { ...x, category: e.target.value, categorySource: "user" }
                        : { ...x, category: "", categorySource: undefined },
                    )
                  }
                  aria-label={`${d.label || "Expense"} category`}
                  className={`${FIELD} mt-2 w-full`}
                >
                  <option value="">{d.category && !known ? "Category removed, pick one" : "Let the AI choose"}</option>
                  {choices.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                {known && d.categorySource === "auto" && <p className="mt-1.5 px-1 text-[12px] text-subtle">Picked by AI</p>}
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          onClick={() =>
            setDrafts((prev) => [
              ...prev,
              { id: `item_${Date.now().toString(36)}`, label: "", amount: "", currency: defaultCurrency, category: "" },
            ])
          }
          className="mt-3 flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
        >
          <PlusIcon className="h-4 w-4" aria-hidden="true" /> Add item
        </button>
        {(invalid || error) && <FieldError>{invalid ?? error}</FieldError>}
      </SheetBody>
      <CancelSave onClose={onClose} onSave={handleSave} busy={busy} />
    </>
  );
}
