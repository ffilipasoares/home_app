import { DISPLAY_CURRENCIES, type DisplayCurrency } from "../../types";

export const CURRENCY_SYMBOL: Record<DisplayCurrency, string> = { GBP: "£", EUR: "€" };
export const CURRENCY_OPTIONS = DISPLAY_CURRENCIES.map((value) => ({ value, label: `${CURRENCY_SYMBOL[value]} ${value}` }));

/** Shared look for text inputs and selects inside sheets. */
export const FIELD =
  "h-12 w-full rounded-xl border border-line bg-raised px-4 text-[15px] text-ink placeholder:text-subtle focus:border-accent focus:outline-none";
