import { formatCurrency } from "../lib/format";

/**
 * The savings goal next to what was actually saved (income − spending −
 * fixed expenses), with a meter and how far above or below the goal that
 * is. While the month is running it's "saved so far"; once the month is
 * over it's the month's result. Fill color carries the state (reached /
 * close / behind), per the dataviz skill's status-palette rule — reserved
 * for genuine state, which "behind on your savings goal" is.
 */
export function SavingsMeter({
  saved,
  goal,
  monthOver,
  currency = "EUR",
}: {
  saved: number;
  goal: number;
  monthOver: boolean;
  currency?: string;
}) {
  if (goal <= 0) {
    return <p className="empty-state">No savings goal set — add one in Settings.</p>;
  }
  const ratio = saved / goal;
  const pct = Math.min(100, Math.max(0, ratio * 100));
  const reached = saved >= goal;
  const color = reached ? "var(--status-good)" : ratio >= 0.5 ? "var(--status-warning)" : "var(--status-critical)";
  const gap = formatCurrency(Math.abs(saved - goal), currency);

  const status = monthOver
    ? reached
      ? `Goal reached: ${gap} above the goal.`
      : `${gap} short of the goal.`
    : reached
      ? `On track: ${gap} above the goal so far.`
      : `${gap} to go to reach the goal.`;

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Goal</div>
          <div style={{ fontWeight: 600, fontSize: 20 }}>{formatCurrency(goal, currency)}</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{monthOver ? "Saved" : "Saved so far"}</div>
          <div style={{ fontWeight: 600, fontSize: 20 }}>{formatCurrency(saved, currency)}</div>
        </div>
      </div>
      <div className="meter-track" role="meter" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.max(0, saved)}>
        <div className="meter-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="meter-caption">
        <span style={{ color: reached ? "var(--status-good)" : undefined }}>{status}</span>
      </div>
    </div>
  );
}
