import { formatCurrency } from "../lib/format";

/** Single ratio against a limit -> meter. Fill color carries the state (on
 * track / behind), per the dataviz skill's status-palette rule — reserved
 * for genuine state, which "behind on your savings goal" is.
 * `actual` is money left this month: what's saved at the end of the month. */
export function SavingsMeter({ actual, target, currency = "EUR" }: { actual: number; target: number; currency?: string }) {
  if (target <= 0) {
    return <p className="empty-state">No savings goal set — add one in Settings.</p>;
  }
  const ratio = actual / target;
  const pct = Math.min(100, Math.max(0, ratio * 100));
  const color = ratio >= 1 ? "var(--status-good)" : ratio >= 0.5 ? "var(--status-warning)" : "var(--status-critical)";

  return (
    <div>
      <div className="meter-track">
        <div className="meter-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="meter-caption">
        <span>{formatCurrency(actual, currency)} left this month</span>
        <span>Goal: {formatCurrency(target, currency)}</span>
      </div>
    </div>
  );
}
