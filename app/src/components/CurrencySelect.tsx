import { DISPLAY_CURRENCIES, type DisplayCurrency } from "../types";

const SYMBOLS: Record<DisplayCurrency, string> = { EUR: "€", GBP: "£" };

/** Which currency a hand-entered amount (salary, savings goal, fixed expense) is in. */
export function CurrencySelect({
  value,
  onChange,
  label = "Currency",
}: {
  value: DisplayCurrency;
  onChange: (c: DisplayCurrency) => void;
  label?: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as DisplayCurrency)}
      // Wide enough for "£ GBP" / "€ EUR" without cutting it off.
      style={{ width: "auto", minWidth: 104, flexShrink: 0 }}
    >
      {DISPLAY_CURRENCIES.map((c) => (
        <option key={c} value={c}>
          {SYMBOLS[c]} {c}
        </option>
      ))}
    </select>
  );
}
