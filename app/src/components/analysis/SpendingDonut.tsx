import { useState } from "react";
import { formatMoney } from "../../lib/format";
import { SURFACE } from "../../lib/chartColors";

export type Slice = { id: string; label: string; amount: number; color: string };

const R_OUT = 92;
const R_IN = 60;
const pct = (share: number) => `${(share * 100).toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;

function arc(start: number, end: number): string {
  // Angles in radians from 12 o'clock, clockwise.
  const p = (r: number, a: number) => [100 + r * Math.sin(a), 100 - r * Math.cos(a)];
  const large = end - start > Math.PI ? 1 : 0;
  const [x1, y1] = p(R_OUT, start);
  const [x2, y2] = p(R_OUT, end);
  const [x3, y3] = p(R_IN, end);
  const [x4, y4] = p(R_IN, start);
  return `M${x1} ${y1}A${R_OUT} ${R_OUT} 0 ${large} 1 ${x2} ${y2}L${x3} ${y3}A${R_IN} ${R_IN} 0 ${large} 0 ${x4} ${y4}Z`;
}

/** Dark ink on light fills, white on dark ones, so a label inside a slice always reads. */
function inkOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.45 ? "#0B0B0C" : "#FFFFFF";
}

/**
 * Part-to-whole of the month's spending: a donut of at most six slices
 * (the caller folds the rest into "Other"), % inside the slices that have
 * room, and a legend that doubles as the table view. Tapping or hovering a
 * slice or a legend row shows it in the centre.
 */
export function SpendingDonut({ slices, currency }: { slices: Slice[]; currency: string }) {
  const [active, setActive] = useState<string | null>(null);
  const total = slices.reduce((s, x) => s + x.amount, 0);
  if (total <= 0) return null;

  const arcs = slices.map((s, i) => {
    const share = s.amount / total;
    const before = slices.slice(0, i).reduce((sum, x) => sum + x.amount, 0) / total;
    const start = before * Math.PI * 2;
    // A single slice is a full ring; nudge the end so the arc still draws.
    return { ...s, share, start, end: share >= 0.9999 ? start + Math.PI * 2 - 0.0001 : start + share * Math.PI * 2 };
  });
  const shown = arcs.find((a) => a.id === active);

  return (
    <div>
      <div className="relative mx-auto aspect-square w-full max-w-[240px]">
        <svg viewBox="0 0 200 200" className="h-full w-full" role="img" aria-label={arcs.map((a) => `${a.label} ${pct(a.share)}`).join(", ")}>
          {arcs.map((a) => {
            const mid = (a.start + a.end) / 2;
            const r = (R_OUT + R_IN) / 2;
            const dim = active !== null && active !== a.id;
            return (
              <g key={a.id}>
                <path
                  d={arc(a.start, a.end)}
                  fill={a.color}
                  stroke={SURFACE}
                  strokeWidth={2}
                  opacity={dim ? 0.35 : 1}
                  className="cursor-pointer transition-opacity duration-150"
                  onPointerEnter={() => setActive(a.id)}
                  onPointerLeave={() => setActive(null)}
                  onClick={() => setActive((v) => (v === a.id ? null : a.id))}
                />
                {/* Only where the slice is wide enough for the label to sit inside it. */}
                {a.share >= 0.08 && (
                  <text
                    x={100 + r * Math.sin(mid)}
                    y={100 - r * Math.cos(mid)}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={11}
                    fontWeight={600}
                    fill={inkOn(a.color)}
                    opacity={dim ? 0.35 : 1}
                    pointerEvents="none"
                  >
                    {Math.round(a.share * 100)}%
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center" aria-live="polite">
          <span className="max-w-[120px] truncate text-[12px] text-muted">{shown ? shown.label : "Spent so far"}</span>
          <span className="text-[17px] font-semibold">{formatMoney(shown ? shown.amount : total, currency)}</span>
          {shown && <span className="text-[12px] text-muted">{pct(shown.share)}</span>}
        </div>
      </div>

      <ul className="mt-4 divide-y divide-line">
        {arcs.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => setActive(a.id)}
              onFocus={() => setActive(a.id)}
              onBlur={() => setActive(null)}
              aria-pressed={active === a.id}
              className={`flex w-full items-center gap-3 px-1 py-2.5 text-left transition-colors focus-visible:outline-none ${
                active === a.id ? "bg-raised" : ""
              }`}
            >
              <span className="h-3 w-3 shrink-0 rounded-[3px]" style={{ backgroundColor: a.color }} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-[14px]">{a.label}</span>
              <span className="w-14 shrink-0 text-right text-[13px] tabular-nums text-muted">{pct(a.share)}</span>
              <span className="w-24 shrink-0 text-right text-[14px] font-medium tabular-nums">{formatMoney(a.amount, currency)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
