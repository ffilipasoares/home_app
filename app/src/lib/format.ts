const formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(currency: string): Intl.NumberFormat {
  let formatter = formatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 });
    formatters.set(currency, formatter);
  }
  return formatter;
}

/**
 * Dashboard/settings figures are always EUR (the home currency every
 * amount gets merged into — see functions/fx.py) and can keep calling
 * this with just a value. A single transaction can be in a different
 * currency (e.g. a GBP account, once Phase 2's bank sync links one) —
 * pass its real `currency` there so it's never mislabeled as EUR.
 */
export function formatCurrency(value: number, currency: string = "EUR"): string {
  return formatterFor(currency).format(value);
}
