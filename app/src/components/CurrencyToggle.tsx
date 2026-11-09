import { saveDisplayCurrency } from "../lib/settings";
import type { DisplayCurrency } from "../types";

const OPTIONS: { value: DisplayCurrency; label: string; name: string }[] = [
  { value: "EUR", label: "€", name: "Euros" },
  { value: "GBP", label: "£", name: "Pounds" },
];

/**
 * € | £ in a page's header: switches the app currency everywhere at once
 * (the same setting as Settings → App currency; every amount is already
 * stored in both, so nothing is recalculated).
 */
export function CurrencyToggle({ uid, value }: { uid: string; value: DisplayCurrency }) {
  return (
    <div role="radiogroup" aria-label="Currency" className="flex shrink-0 rounded-full bg-surface p-1">
      {OPTIONS.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.name}
            onClick={() => !active && saveDisplayCurrency(uid, o.value)}
            className={`h-8 w-8 rounded-full text-[15px] font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              active ? "bg-accent text-canvas" : "text-muted hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
