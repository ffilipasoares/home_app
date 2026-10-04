import { DISPLAY_CURRENCIES, type DisplayCurrency } from "../types";

const SYMBOLS: Record<DisplayCurrency, string> = { EUR: "€", GBP: "£" };

/** € / £ toggle for which currency the Dashboard shows. */
export function CurrencySwitch({ value, onChange }: { value: DisplayCurrency; onChange: (c: DisplayCurrency) => void }) {
  return (
    <div className="segmented" role="group" aria-label="Currency">
      {DISPLAY_CURRENCIES.map((c) => (
        <button key={c} type="button" aria-pressed={value === c} onClick={() => onChange(c)} title={c}>
          {SYMBOLS[c]} {c}
        </button>
      ))}
    </div>
  );
}
