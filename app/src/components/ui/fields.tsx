import type { ReactNode } from "react";
import { CURRENCY_OPTIONS, CURRENCY_SYMBOL } from "./styles";
import type { DisplayCurrency } from "../../types";

export function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium text-muted">
      {children}
    </label>
  );
}

export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-2 text-sm text-negative">
      {children}
    </p>
  );
}

/**
 * A big amount box. `value` is the text as typed (parsed on save with
 * lib/amount's parseAmount, so 1833,38 and 1833.38 both work); with
 * `onCurrencyChange` it carries its own currency picker.
 */
export function AmountField({
  id,
  label,
  value,
  onChange,
  currency,
  onCurrencyChange,
  error,
  hint,
  autoFocus,
  placeholder = "0,00",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  currency: DisplayCurrency;
  onCurrencyChange?: (currency: DisplayCurrency) => void;
  error?: string;
  hint?: ReactNode;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div
        className={`mt-2 flex h-14 items-center rounded-xl border bg-raised pl-4 transition-colors focus-within:border-accent ${
          error ? "border-negative" : "border-line"
        } ${onCurrencyChange ? "pr-1.5" : "pr-4"}`}
      >
        <span className="mr-2 text-lg text-subtle" aria-hidden="true">
          {CURRENCY_SYMBOL[currency]}
        </span>
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className="w-full min-w-0 bg-transparent text-xl font-semibold tabular-nums text-ink placeholder:text-subtle focus:outline-none"
          placeholder={placeholder}
        />
        {onCurrencyChange && (
          <select
            value={currency}
            onChange={(e) => onCurrencyChange(e.target.value as DisplayCurrency)}
            aria-label={`${label} currency`}
            className="h-10 shrink-0 rounded-lg border border-line bg-surface px-2.5 text-sm font-semibold text-ink focus:border-accent focus:outline-none"
          >
            {CURRENCY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </div>
      {error ? (
        <FieldError id={`${id}-error`}>{error}</FieldError>
      ) : hint ? (
        <div id={`${id}-hint`} className="mt-2 text-sm text-muted">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

/** Pill buttons to pick one option, e.g. a category. */
export function ChipPicker({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-muted">{legend}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => {
          const active = value === o.id;
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(o.id)}
              className={`h-9 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                active ? "border-ink bg-ink text-canvas" : "border-line text-muted hover:text-ink"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** A card-style on/off switch with a title and a short description. */
export function Toggle({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-raised px-4 py-3.5">
      <span>
        <span className="block text-[15px] font-medium">{title}</span>
        {description && <span className="block text-[13px] text-muted">{description}</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden="true"
        className="relative h-7 w-12 shrink-0 rounded-full bg-selected transition-colors duration-150 after:absolute after:left-0.5 after:top-0.5 after:h-6 after:w-6 after:rounded-full after:bg-ink after:transition-transform after:duration-150 peer-checked:bg-positive peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-accent"
      />
    </label>
  );
}
