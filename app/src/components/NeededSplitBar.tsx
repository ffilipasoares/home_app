import { formatCurrency } from "../lib/format";

/**
 * Part-to-whole of two categories -> stacked bar, categorical color (the
 * series ARE the point here: needed vs discretionary). Legend is mandatory
 * for 2+ series; both segments are also direct-labeled since there are only two.
 */
export function NeededSplitBar({ needed, discretionary }: { needed: number; discretionary: number }) {
  const total = needed + discretionary;
  if (total <= 0) {
    return <p className="empty-state">No expenses recorded for this month yet.</p>;
  }
  const neededPct = (needed / total) * 100;
  const discretionaryPct = 100 - neededPct;

  return (
    <div>
      <div className="split-bar">
        <div style={{ width: `${neededPct}%`, background: "var(--series-1)" }} />
        <div style={{ width: `${discretionaryPct}%`, background: "var(--series-2)" }} />
      </div>
      <div className="split-legend">
        <span>
          <span className="swatch" style={{ background: "var(--series-1)" }} />
          Needed — {formatCurrency(needed)} ({neededPct.toFixed(0)}%)
        </span>
        <span>
          <span className="swatch" style={{ background: "var(--series-2)" }} />
          Discretionary — {formatCurrency(discretionary)} ({discretionaryPct.toFixed(0)}%)
        </span>
      </div>
    </div>
  );
}
