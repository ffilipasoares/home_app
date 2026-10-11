import { useState } from "react";
import { BottomSheet, SheetBody, SheetFooter } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import { AmountField, ChipPicker, FieldError, FieldLabel } from "../ui/fields";
import { FIELD } from "../ui/styles";
import { SegmentedControl } from "../ui/SegmentedControl";
import { CategoryIcon } from "../CategoryIcon";
import { AI_SURE_THRESHOLD } from "../../lib/transactionState";
import { parseAmount } from "../../lib/amount";
import { formatCurrency, formatMoney } from "../../lib/format";
import { formatShortDate, todayIso } from "../../lib/month";
import { amountShown } from "../../lib/transactionFilters";
import { addManualTransaction, deleteTransaction, saveTransactionEdit } from "../../lib/transactions";
import type { CategoryDef, DisplayCurrency, Transaction } from "../../types";

type Props = {
  open: boolean;
  onClose: () => void;
  uid: string;
  /** null: add a new transaction by hand. */
  transaction: Transaction | null;
  categories: CategoryDef[];
  currency: DisplayCurrency;
  /** Name of the account it came from, e.g. "Revolut GBP". */
  sourceLabel: (tx: Transaction) => string;
  /** After adding: the month the new transaction counts in. */
  onAdded: (month: string) => void;
};

export function TransactionSheet({ open, onClose, transaction, ...rest }: Props) {
  return (
    <BottomSheet open={open} onClose={onClose} title={transaction ? "Transaction" : "New transaction"}>
      {transaction ? (
        <EditForm key={transaction.id} transaction={transaction} onClose={onClose} {...rest} />
      ) : (
        <AddForm onClose={onClose} {...rest} />
      )}
    </BottomSheet>
  );
}

/**
 * A transaction from the bank (or a CSV) keeps its amount, name and date as
 * the bank reported them; what's yours to change is its category and the
 * month it counts toward. Anything can be deleted.
 */
function EditForm({
  transaction: tx,
  onClose,
  uid,
  categories,
  currency,
  sourceLabel,
}: Omit<Props, "open" | "transaction" | "onAdded"> & { transaction: Transaction }) {
  const [category, setCategory] = useState(tx.category ?? "");
  const [budgetMonth, setBudgetMonth] = useState(tx.month);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string>();

  const categoryDirty = category !== (tx.category ?? "");
  const monthDirty = budgetMonth !== tx.month;
  // Confirming an older AI suggestion counts as a change too.
  const saveCategory = !!category && (categoryDirty || tx.needsReview);
  const canSave = (saveCategory || monthDirty) && /^\d{4}-\d{2}$/.test(budgetMonth);
  const confirmOnly = tx.needsReview && !!tx.category && !categoryDirty && !monthDirty;
  const current = categories.find((c) => c.id === tx.category);
  const shown = amountShown(tx, currency);
  const unsure =
    !!tx.category && tx.source === "auto" && tx.confidence !== undefined && tx.confidence < AI_SURE_THRESHOLD;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <>
      <SheetBody>
        <div className="flex items-center gap-3 rounded-xl bg-raised p-4">
          <CategoryIcon category={current} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-medium">{tx.merchantRaw}</p>
            <p className="mt-0.5 text-[13px] text-muted">
              {formatShortDate(tx.date)} · {sourceLabel(tx)}
              {tx.pending && " · Pending"}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className={`text-[17px] font-semibold tabular-nums ${tx.amount > 0 ? "text-positive" : ""}`}>
              {formatMoney(shown ?? tx.amount, shown !== undefined ? currency : tx.currency, { signed: true })}
            </p>
            {tx.currency !== currency && (
              <p className="text-[12px] tabular-nums text-subtle">{formatCurrency(Math.abs(tx.amount), tx.currency)}</p>
            )}
          </div>
        </div>

        {tx.internalTransfer && (
          <p className="text-[13px] text-muted">
            A move between your own accounts: it isn't counted as spending or income.
          </p>
        )}
        {tx.pending && (
          <p className="text-[13px] text-muted">
            Not settled by the bank yet. The amount can still change; the next sync updates it.
          </p>
        )}
        {!tx.internalTransfer && tx.needsReview && (
          <p className="text-[13px] text-muted">
            {tx.category
              ? "The AI suggested this category. Confirm it or pick another."
              : tx.aiError
                ? `The AI couldn't categorize this yet (${tx.aiError}); it tries again at the next sync. You can pick one yourself.`
                : "The AI is still categorizing this. You can also pick one yourself."}
          </p>
        )}
        {unsure && (
          <p className="text-[13px] text-muted">
            The AI wasn't sure about this one ({Math.round((tx.confidence ?? 0) * 100)}%). Change it if it's wrong.
          </p>
        )}

        <ChipPicker legend="Category" value={category} onChange={setCategory} options={categories} />

        <div>
          <FieldLabel htmlFor="tx-month">Counts toward</FieldLabel>
          <input
            id="tx-month"
            type="month"
            value={budgetMonth}
            onChange={(e) => setBudgetMonth(e.target.value)}
            className={`${FIELD} mt-2`}
          />
          <p className="mt-2 text-[13px] text-muted">The month this transaction is counted in on the Dashboard.</p>
        </div>

        {error && <FieldError>{error}</FieldError>}
      </SheetBody>
      <SheetFooter>
        {confirmingDelete ? (
          <>
            <Button variant="secondary" fullWidth onClick={() => setConfirmingDelete(false)} disabled={busy}>
              Keep it
            </Button>
            <Button
              fullWidth
              className="!bg-negative !text-canvas"
              disabled={busy}
              onClick={() => run(() => deleteTransaction(uid, tx.id))}
            >
              Delete for good
            </Button>
          </>
        ) : (
          <>
            <Button variant="danger" onClick={() => setConfirmingDelete(true)} disabled={busy}>
              Delete
            </Button>
            <Button
              fullWidth
              disabled={!canSave || busy}
              onClick={() =>
                run(() =>
                  saveTransactionEdit(uid, tx.id, {
                    category: saveCategory ? category : undefined,
                    month: monthDirty ? budgetMonth : undefined,
                  }),
                )
              }
            >
              {busy ? "Saving…" : confirmOnly ? "Confirm" : "Save"}
            </Button>
          </>
        )}
      </SheetFooter>
    </>
  );
}

/** Adds a transaction by hand, e.g. something paid from another account. */
function AddForm({
  onClose,
  uid,
  categories,
  currency: defaultCurrency,
  onAdded,
}: Omit<Props, "open" | "transaction" | "sourceLabel">) {
  const [direction, setDirection] = useState<"out" | "in">("out");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<DisplayCurrency>(defaultCurrency);
  const [name, setName] = useState("");
  const [category, setCategory] = useState(""); // "" = let the AI choose
  const [date, setDate] = useState(todayIso());
  const [errors, setErrors] = useState<{ name?: string; amount?: string; date?: string; save?: string }>({});
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    const value = parseAmount(amount);
    const next: typeof errors = {};
    if (value === null || value === undefined || value <= 0) next.amount = "Enter an amount above 0, e.g. 12,50";
    if (!name.trim()) next.name = "Add a name, e.g. the shop or what it was for";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) next.date = "Pick a date";
    setErrors(next);
    if (Object.keys(next).length > 0 || !value) return;
    setBusy(true);
    try {
      const month = await addManualTransaction(uid, {
        date,
        merchantRaw: name.trim(),
        amount: direction === "out" ? -value : value,
        currency,
        category: category || null,
      });
      onAdded(month);
      onClose();
    } catch (err) {
      setErrors({ save: err instanceof Error ? err.message : String(err) });
      setBusy(false);
    }
  }

  return (
    <>
      <SheetBody>
        <p className="text-[13px] text-muted">
          For something paid or received outside the connected accounts. It counts on the Dashboard like any other.
        </p>
        <SegmentedControl
          label="Spent or received"
          value={direction}
          onChange={setDirection}
          options={[
            { value: "out", label: "Spent" },
            { value: "in", label: "Received" },
          ]}
        />
        <AmountField
          id="tx-amount"
          label="Amount"
          value={amount}
          onChange={(v) => {
            setAmount(v);
            setErrors((e) => ({ ...e, amount: undefined }));
          }}
          currency={currency}
          onCurrencyChange={setCurrency}
          error={errors.amount}
          autoFocus
        />
        <div>
          <FieldLabel htmlFor="tx-name">Name</FieldLabel>
          <input
            id="tx-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setErrors((er) => ({ ...er, name: undefined }));
            }}
            aria-invalid={Boolean(errors.name)}
            placeholder="e.g. Dinner at Tasca do Chico"
            className={`${FIELD} mt-2 ${errors.name ? "!border-negative" : ""}`}
          />
          {errors.name && <FieldError>{errors.name}</FieldError>}
        </div>
        <ChipPicker
          legend="Category"
          value={category}
          onChange={setCategory}
          options={[{ id: "", label: "Let the AI choose" }, ...categories]}
        />
        <div>
          <FieldLabel htmlFor="tx-date">Date</FieldLabel>
          <input
            id="tx-date"
            type="date"
            value={date}
            max={todayIso()}
            onChange={(e) => setDate(e.target.value)}
            className={`${FIELD} mt-2`}
          />
          {errors.date && <FieldError>{errors.date}</FieldError>}
        </div>
        {errors.save && <FieldError>{errors.save}</FieldError>}
      </SheetBody>
      <SheetFooter>
        <Button variant="secondary" fullWidth onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button fullWidth onClick={handleSave} disabled={busy}>
          {busy ? "Adding…" : "Add transaction"}
        </Button>
      </SheetFooter>
    </>
  );
}
