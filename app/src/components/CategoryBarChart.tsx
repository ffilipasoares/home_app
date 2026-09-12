import { useState } from "react";
import { formatCurrency } from "../lib/format";

type Row = { label: string; value: number };

/**
 * Magnitude comparison across categories -> horizontal bar, single sequential
 * hue (dataviz skill: "compare magnitude" pairs with sequential color, not
 * categorical — categorical is reserved for when the series' identity is the
 * point). Sorted descending; value labeled at the bar's tip; a table-view
 * toggle is the accessibility twin required for every chart.
 */
export function CategoryBarChart({ rows }: { rows: Row[] }) {
  const [asTable, setAsTable] = useState(false);
  const sorted = [...rows].filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  const max = Math.max(1, ...sorted.map((r) => r.value));

  if (sorted.length === 0) {
    return <p className="empty-state">No expenses recorded for this month yet.</p>;
  }

  return (
    <div>
      <button
        type="button"
        className="button secondary"
        style={{ fontSize: 12, padding: "4px 10px", marginBottom: 10 }}
        onClick={() => setAsTable((v) => !v)}
      >
        {asTable ? "Show chart" : "Show table"}
      </button>

      {asTable ? (
        <div className="table-scroll">
          <table className="import-preview">
            <thead>
              <tr>
                <th>Category</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td>{formatCurrency(row.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div role="img" aria-label="Expenses by category, largest first">
          {sorted.map((row) => (
            <div className="bar-row" key={row.label}>
              <div className="bar-label" title={row.label}>
                {row.label}
              </div>
              <div className="bar-track">
                <div
                  style={{
                    height: 24,
                    width: `${Math.max(3, (row.value / max) * 100)}%`,
                    background: "var(--seq-450)",
                    borderTopRightRadius: 4,
                    borderBottomRightRadius: 4,
                  }}
                />
              </div>
              <div className="bar-value">{formatCurrency(row.value)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
