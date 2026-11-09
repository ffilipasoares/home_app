const formatters = new Map<string, Intl.NumberFormat>();

/** A currency code Intl accepts (three letters), so formatting never throws. */
export function isCurrencyCode(currency: string | null | undefined): currency is string {
  return typeof currency === "string" && /^[A-Za-z]{3}$/.test(currency);
}

function formatterFor(currency: string): Intl.NumberFormat {
  let formatter = formatters.get(currency);
  if (!formatter) {
    // Always cents: amounts are shown as they are, never rounded to whole euros/pounds.
    // A missing or odd code (a price feed without one) shows the plain number
    // rather than throwing and blanking the screen.
    formatter = isCurrencyCode(currency)
      ? new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    formatters.set(currency, formatter);
  }
  return formatter;
}

/** Formats an amount in `currency` (EUR by default) with its symbol and cents. */
export function formatCurrency(value: number, currency: string = "EUR"): string {
  return formatterFor(currency).format(value);
}

/**
 * An amount with a real minus sign for money out and, with `signed`, a "+"
 * for money in: "−12,50 £", "+2450,00 £".
 */
export function formatMoney(value: number, currency: string, options: { signed?: boolean } = {}): string {
  const formatted = formatCurrency(Math.abs(value), currency);
  if (value < 0 && Math.abs(value) >= 0.005) return `−${formatted}`;
  if (options.signed && value >= 0.005) return `+${formatted}`;
  return formatted;
}
