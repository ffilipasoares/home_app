import { useState } from "react";
import { BottomSheet, SheetBody } from "../ui/BottomSheet";
import { AmountField, FieldError, FieldLabel } from "../ui/fields";
import { SegmentedControl } from "../ui/SegmentedControl";
import { CancelSave } from "./CancelSave";
import { useSave } from "../../lib/useSave";
import { formatAmountInput, parseAmount } from "../../lib/amount";
import { saveUserSettings } from "../../lib/settings";
import { ENTRY_CURRENCY, type DisplayCurrency, type SavingsGoal, type UserSettings } from "../../types";

export function SavingsGoalSheet({
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
    <BottomSheet open={open} onClose={onClose} title="Savings goal">
      <GoalForm onClose={onClose} uid={uid} goal={settings.savingsGoal} />
    </BottomSheet>
  );
}

function GoalForm({ onClose, uid, goal }: { onClose: () => void; uid: string; goal: SavingsGoal }) {
  const [type, setType] = useState<SavingsGoal["type"]>(goal.type);
  const [amount, setAmount] = useState(goal.type === "fixed" ? formatAmountInput(goal.value) : "");
  const [percent, setPercent] = useState(goal.type === "percent" ? formatAmountInput(goal.value) : "");
  const [currency, setCurrency] = useState<DisplayCurrency>(goal.currency ?? ENTRY_CURRENCY);
  const [invalid, setInvalid] = useState<string>();
  const { busy, error, save } = useSave(onClose);

  function handleSave() {
    if (type === "fixed") {
      const parsed = parseAmount(amount);
      if (parsed === undefined || (parsed !== null && parsed < 0)) {
        setInvalid("Enter an amount like 2750,00");
        return;
      }
      save(() => saveUserSettings(uid, { savingsGoal: { type, value: parsed ?? 0, currency } }));
    } else {
      const parsed = parseAmount(percent);
      if (parsed === null || parsed === undefined || parsed < 0 || parsed > 100) {
        setInvalid("Enter a percentage between 0 and 100");
        return;
      }
      save(() => saveUserSettings(uid, { savingsGoal: { type, value: parsed, currency } }));
    }
  }

  return (
    <>
      <SheetBody>
        <SegmentedControl<SavingsGoal["type"]>
          label="Savings goal type"
          value={type}
          onChange={(t) => {
            setType(t);
            setInvalid(undefined);
          }}
          options={[
            { value: "fixed", label: "Fixed amount" },
            { value: "percent", label: "% of income" },
          ]}
        />
        {type === "fixed" ? (
          <AmountField
            id="goal-amount"
            label="Amount per month"
            value={amount}
            onChange={(v) => {
              setAmount(v);
              setInvalid(undefined);
            }}
            currency={currency}
            onCurrencyChange={setCurrency}
            error={invalid}
            autoFocus
          />
        ) : (
          <div>
            <FieldLabel htmlFor="goal-percent">Share of monthly income</FieldLabel>
            <div
              className={`mt-2 flex h-14 items-center rounded-xl border bg-raised px-4 focus-within:border-accent ${
                invalid ? "border-negative" : "border-line"
              }`}
            >
              <input
                id="goal-percent"
                inputMode="decimal"
                value={percent}
                onChange={(e) => {
                  setPercent(e.target.value);
                  setInvalid(undefined);
                }}
                aria-invalid={Boolean(invalid)}
                placeholder="15"
                className="w-full bg-transparent text-xl font-semibold tabular-nums placeholder:text-subtle focus:outline-none"
                autoFocus
              />
              <span className="text-lg text-subtle" aria-hidden="true">
                %
              </span>
            </div>
            {invalid && <FieldError>{invalid}</FieldError>}
          </div>
        )}
        <p className="text-[13px] leading-relaxed text-muted">
          Set aside first: money left = income − spending − fixed expenses − this goal. Investments don't count here.
        </p>
        {error && <FieldError>{error}</FieldError>}
      </SheetBody>
      <CancelSave onClose={onClose} onSave={handleSave} busy={busy} />
    </>
  );
}
