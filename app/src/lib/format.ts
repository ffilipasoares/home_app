const formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(currency: string): Intl.NumberFormat {
  let formatter = formatters.get(currency);
  if (!formatter) {
    // Always cents: amounts are shown as they are, never rounded to whole euros/pounds.
    formatter = new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
    formatters.set(currency, formatter);
  }
  return formatter;
}

/** Formats an amount in `currency` (EUR by default) with its symbol and cents. */
export function formatCurrency(value: number, currency: string = "EUR"): string {
  return formatterFor(currency).format(value);
}
