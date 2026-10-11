import { useState, type CSSProperties } from "react";
import { formatAmountInput, parseAmount } from "../lib/amount";

/**
 * A box for an amount that takes a decimal comma or point (see lib/amount.ts).
 * Reports each valid value as it's typed (null when emptied); while what's
 * typed isn't an amount the box is outlined and the last valid value stands.
 */
export function AmountInput({
  value,
  onChange,
  placeholder,
  label,
  style,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  label?: string;
  style?: CSSProperties;
}) {
  const [draft, setDraft] = useState(() => formatAmountInput(value));
  const [shownValue, setShownValue] = useState(value);

  // Show a value changed from outside (another device, a reset), but don't
  // reformat what's being typed when it already means the same amount.
  if (value !== shownValue) {
    setShownValue(value);
    if (parseAmount(draft) !== value) setDraft(formatAmountInput(value));
  }

  const invalid = parseAmount(draft) === undefined;

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      aria-label={label}
      aria-invalid={invalid || undefined}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => {
        setDraft(e.target.value);
        const parsed = parseAmount(e.target.value);
        if (parsed !== undefined) onChange(parsed);
      }}
      style={{ ...style, ...(invalid ? { borderColor: "var(--status-critical)" } : null) }}
    />
  );
}
