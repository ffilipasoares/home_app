import { useEffect, useState } from "react";
import { Link2Icon, SearchIcon, XIcon } from "lucide-react";
import { BottomSheet, SheetBody, SheetFooter } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import { AmountField, ChipPicker, FieldError, FieldLabel, Toggle } from "../ui/fields";
import { FIELD } from "../ui/styles";
import { SegmentedControl } from "../ui/SegmentedControl";
import { CategoryIcon } from "../CategoryIcon";
import { AI_SURE_THRESHOLD, isNotCounted } from "../../lib/transactionState";
import { parseAmount } from "../../lib/amount";
import { formatCurrency, formatMoney } from "../../lib/format";
import { formatMonth, formatShortDate, todayIso } from "../../lib/month";
import { paidBackFor, paybackCandidates } from "../../lib/paybacks";
import { amountShown } from "../../lib/transactionFilters";
import {
  addManualTransaction,
  deleteTransaction,
  saveTransactionEdit,
  subscribeAllTransactions,
} from "../../lib/transactions";
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
  const [note, setNote] = useState(tx.note ?? "");
  const [notCounted, setNotCounted] = useState(isNotCounted(tx));
  const [paysBack, setPaysBack] = useState(tx.paysBack ?? "");
  const [all, setAll] = useState<Transaction[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string>();

  // Every transaction, for linking a payback to its expense and showing
  // what an expense was paid back.
  useEffect(() => subscribeAllTransactions(uid, setAll), [uid]);
  const canPayBack = tx.amount > 0 && !tx.internalTransfer;
  // A linked payback takes the expense's category and month.
  const expense = paysBack ? all?.find((t) => t.id === paysBack) : undefined;
  const paysBackDirty = paysBack !== (tx.paysBack ?? "");
  const linkCategory =
    expense?.category && (paysBackDirty || expense.category !== tx.category) ? expense.category : undefined;
  const linkMonth = expense && expense.month !== tx.month ? expense.month : undefined;
  const paidBack = tx.amount < 0 && all ? paidBackFor(tx, all, currency) : null;

  const categoryDirty = category !== (tx.category ?? "");
  const monthDirty = budgetMonth !== tx.month;
  const noteDirty = note.trim() !== (tx.note ?? "");
  const countingDirty = notCounted !== isNotCounted(tx);
  // Counted, it needs a category; one the AI isn't working on (a move
  // between your accounts you now count) has to be picked here.
  const needsCategory = !notCounted && !category && !tx.needsReview;
  // Confirming an older AI suggestion counts as a change too, unless it's
  // not counted anyway.
  const saveCategory = !!category && (categoryDirty || (tx.needsReview && !notCounted));
  const canSave =
    (saveCategory || monthDirty || noteDirty || countingDirty || paysBackDirty) &&
    (!!expense || !needsCategory) &&
    (!paysBack || !!expense) &&
    /^\d{4}-\d{2}$/.test(budgetMonth);
  const confirmOnly =
    tx.needsReview && !!tx.category && !notCounted && !categoryDirty && !monthDirty && !noteDirty && !countingDirty;
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

        {tx.pending && (
          <p className="text-[13px] text-muted">
            Not settled by the bank yet. The amount can still change; the next sync updates it.
          </p>
        )}
        {!notCounted && tx.needsReview && (
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

        {paidBack && paidBack.total > 0 && (
          <p className="text-[13px] text-muted">
            {formatMoney(paidBack.total, currency)} paid back (
            {paidBack.paybacks.map((p) => p.merchantRaw).join(", ")}), so it cost you{" "}
            <span className="font-medium text-ink">
              {formatMoney(Math.max(0, -(shown ?? tx.amount) - paidBack.total), currency)}
            </span>
            .
          </p>
        )}

        {canPayBack && all && (
          <PaysBackField
            payback={tx}
            expense={expense}
            all={all}
            categories={categories}
            currency={currency}
            onChange={setPaysBack}
          />
        )}

        {expense ? (
          <p className="text-[13px] text-muted">
            Counts in {categories.find((c) => c.id === expense.category)?.label ?? expense.category},{" "}
            {formatMonth(expense.month)}, like the expense it pays back.
          </p>
        ) : (
          <>
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
          </>
        )}

        <NoteField value={note} onChange={setNote} />

        <div>
          <Toggle
            title="Don't count this"
            description={
              tx.internalTransfer
                ? "A move between your own accounts, so it's left out of every total. Switch off to count it."
                : "Left out of spending, income and every total, like a move between your accounts."
            }
            checked={notCounted}
            onChange={setNotCounted}
          />
          {needsCategory && <p className="mt-2 text-[13px] text-warning">Pick a category above to count it.</p>}
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
                    ...(expense
                      ? { category: linkCategory, month: linkMonth }
                      : { category: saveCategory ? category : undefined, month: monthDirty ? budgetMonth : undefined }),
                    paysBack: paysBackDirty ? paysBack || null : undefined,
                    note: noteDirty ? note : undefined,
                    notCounted: countingDirty ? notCounted : undefined,
                    internalTransfer: tx.internalTransfer,
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
  const [note, setNote] = useState("");
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
        note,
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
        <NoteField value={note} onChange={setNote} />
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

const NOTE_MAX = 200;

/** An optional note of your own; it's searchable on the Transactions page. */
function NoteField({ value, onChange }: { value: string; onChange: (note: string) => void }) {
  return (
    <div>
      <FieldLabel htmlFor="tx-note">Note (optional)</FieldLabel>
      <input
        id="tx-note"
        type="text"
        value={value}
        maxLength={NOTE_MAX}
        placeholder="e.g. Mum's birthday dinner"
        onChange={(e) => onChange(e.target.value)}
        className={`${FIELD} mt-2`}
      />
    </div>
  );
}

/**
 * Links money back from someone (a friend's share of a dinner) to the
 * expense it pays back, picked from recent spending.
 */
function PaysBackField({
  payback,
  expense,
  all,
  categories,
  currency,
  onChange,
}: {
  payback: Transaction;
  expense: Transaction | undefined;
  all: Transaction[];
  categories: CategoryDef[];
  currency: DisplayCurrency;
  onChange: (expenseId: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState("");
  const categoryOf = (tx: Transaction) => categories.find((c) => c.id === tx.category);

  const row = (tx: Transaction) => (
    <>
      <CategoryIcon category={categoryOf(tx)} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium">{tx.merchantRaw}</span>
        <span className="block truncate text-[13px] text-muted">
          {formatShortDate(tx.date)} · {categoryOf(tx)?.label ?? tx.category}
        </span>
      </span>
      <span className="shrink-0 text-[15px] font-semibold tabular-nums">
        {formatMoney(amountShown(tx, currency) ?? tx.amount, currency, { signed: true })}
      </span>
    </>
  );

  if (expense) {
    return (
      <div>
        <FieldLabel>Pays back</FieldLabel>
        <div className="mt-2 flex items-center gap-3 rounded-xl bg-raised p-3">
          {row(expense)}
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Remove the link"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-selected hover:text-ink"
          >
            <XIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  if (!picking) {
    return (
      <div>
        <Button variant="secondary" fullWidth onClick={() => setPicking(true)}>
          <Link2Icon className="h-4 w-4" aria-hidden="true" />
          Pays back an expense…
        </Button>
        <p className="mt-2 text-[13px] text-muted">
          Money back from someone, like a friend&apos;s share of a dinner? Link it to the expense so it reduces that
          category.
        </p>
      </div>
    );
  }

  const candidates = paybackCandidates(payback, all, categories, search);
  return (
    <div>
      <FieldLabel htmlFor="payback-search">Which expense does it pay back?</FieldLabel>
      <div className={`${FIELD} mt-2 flex items-center gap-2`}>
        <SearchIcon className="h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />
        <input
          id="payback-search"
          type="search"
          value={search}
          placeholder="Search name or amount"
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-transparent text-[15px] text-ink placeholder:text-subtle focus:outline-none"
        />
      </div>
      {candidates.length === 0 ? (
        <p className="mt-2 text-[13px] text-muted">No matching expense in the last four months.</p>
      ) : (
        <ul className="mt-2 max-h-72 divide-y divide-line overflow-y-auto rounded-xl bg-raised">
          {candidates.map((tx) => (
            <li key={tx.id}>
              <button
                type="button"
                onClick={() => onChange(tx.id)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-selected"
              >
                {row(tx)}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={() => setPicking(false)} className="mt-2 text-[13px] font-medium text-muted">
        Cancel
      </button>
    </div>
  );
}
