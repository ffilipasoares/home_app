import { useState } from "react";
import { BottomSheet, SheetBody } from "../ui/BottomSheet";
import { CancelSave } from "./CancelSave";
import { useSave } from "../../lib/useSave";
import { AmountField, FieldError } from "../ui/fields";
import { SegmentedControl } from "../ui/SegmentedControl";
import { formatAmountInput, parseAmount } from "../../lib/amount";
import { formatCurrency } from "../../lib/format";
import { formatMonth } from "../../lib/month";
import { saveUserSettings } from "../../lib/settings";
import { ENTRY_CURRENCY, type DisplayCurrency, type UserSettings } from "../../types";

/**
 * Filipa's salary: detected each month from Salary transactions, or a
 * fixed amount (in its own currency) used every month instead.
 */
export function FilipaSalarySheet({
  open,
  onClose,
  uid,
  settings,
  detected,
  month,
}: {
  open: boolean;
  onClose: () => void;
  uid: string;
  settings: UserSettings;
  /** Detected in `month`, in the salary currency; null when nothing was. */
  detected: number | null;
  month: string;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Filipa's salary">
      <FilipaForm onClose={onClose} uid={uid} settings={settings} detected={detected} month={month} />
    </BottomSheet>
  );
}

function FilipaForm({
  onClose,
  uid,
  settings,
  detected,
  month,
}: {
  onClose: () => void;
  uid: string;
  settings: UserSettings;
  detected: number | null;
  month: string;
}) {
  const fixedNow = settings.filipaSalaryAmount != null;
  const salaryCurrency = settings.salaryCurrency ?? ENTRY_CURRENCY;
  const [mode, setMode] = useState<"detected" | "fixed">(fixedNow ? "fixed" : "detected");
  const [value, setValue] = useState(fixedNow ? formatAmountInput(settings.filipaSalaryAmount) : "");
  const [currency, setCurrency] = useState<DisplayCurrency>(salaryCurrency);
  const [invalid, setInvalid] = useState<string>();
  const { busy, error, save } = useSave(onClose);

  function handleSave() {
    if (mode === "detected") {
      save(() => saveUserSettings(uid, { filipaSalaryAmount: null }));
      return;
    }
    const parsed = parseAmount(value);
    if (parsed === null || parsed === undefined || parsed <= 0) {
      setInvalid("Enter the amount she's paid each month, e.g. 11669,26");
      return;
    }
    save(() => saveUserSettings(uid, { filipaSalaryAmount: parsed, salaryCurrency: currency }));
  }

  return (
    <>
      <SheetBody>
        <SegmentedControl
          label="How to get Filipa's salary"
          value={mode}
          onChange={setMode}
          options={[
            { value: "detected", label: "Detect each month" },
            { value: "fixed", label: "Fixed amount" },
          ]}
        />
        {mode === "detected" ? (
          <div className="rounded-xl bg-raised px-4 py-3.5">
            <p className="text-[13px] text-muted">Detected in {formatMonth(month)}</p>
            <p className="mt-0.5 font-display text-xl font-bold tabular-nums">
              {detected !== null ? formatCurrency(detected, salaryCurrency) : "Nothing yet"}
            </p>
            <p className="mt-2 text-[13px] text-muted">Found from the salary payments in your transactions, every month.</p>
          </div>
        ) : (
          <AmountField
            id="filipa-fixed"
            label="Monthly salary"
            value={value}
            onChange={(v) => {
              setValue(v);
              setInvalid(undefined);
            }}
            currency={currency}
            onCurrencyChange={setCurrency}
            error={invalid}
            hint={
              detected !== null
                ? `Used every month instead of the detected amount (${formatCurrency(detected, salaryCurrency)} in ${formatMonth(month)}).`
                : "Used every month instead of the detected amount."
            }
            autoFocus
          />
        )}
        {error && <FieldError>{error}</FieldError>}
      </SheetBody>
      <CancelSave onClose={onClose} onSave={handleSave} busy={busy} />
    </>
  );
}

/** João's salary: the amount and currency he's actually paid, used for every month. */
export function JoaoSalarySheet({
  open,
  onClose,
  uid,
  settings,
}: {
  open: boolean;
  onClose: () => void;
  uid: string;
  settings: UserSettings;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="João's salary">
      <JoaoForm onClose={onClose} uid={uid} settings={settings} />
    </BottomSheet>
  );
}

function JoaoForm({ onClose, uid, settings }: { onClose: () => void; uid: string; settings: UserSettings }) {
  const [value, setValue] = useState(settings.joaoSalary ? formatAmountInput(settings.joaoSalary.amount) : "");
  const [currency, setCurrency] = useState<DisplayCurrency>(settings.joaoSalary?.currency ?? ENTRY_CURRENCY);
  const [invalid, setInvalid] = useState<string>();
  const { busy, error, save } = useSave(onClose);

  function handleSave() {
    const parsed = parseAmount(value);
    if (parsed === undefined || (parsed !== null && parsed < 0)) {
      setInvalid("Enter an amount like 4263,00, or leave it empty");
      return;
    }
    save(() => saveUserSettings(uid, { joaoSalary: parsed === null ? null : { amount: parsed, currency } }));
  }

  return (
    <>
      <SheetBody>
        <AmountField
          id="joao-salary"
          label="Monthly salary"
          value={value}
          onChange={(v) => {
            setValue(v);
            setInvalid(undefined);
          }}
          currency={currency}
          onCurrencyChange={setCurrency}
          error={invalid}
          hint="The amount and currency he's actually paid, used for every month. Leave it empty if there's none."
          placeholder="Not set"
          autoFocus
        />
        {error && <FieldError>{error}</FieldError>}
      </SheetBody>
      <CancelSave onClose={onClose} onSave={handleSave} busy={busy} />
    </>
  );
}

