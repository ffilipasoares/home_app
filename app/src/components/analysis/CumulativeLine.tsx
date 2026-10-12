import { useEffect, useRef, useState } from "react";
import { ACCENT, MUTED, SURFACE, compactMoney } from "../../lib/chartColors";
import { formatMoney } from "../../lib/format";

const HEIGHT = 190;
const PAD = { top: 16, right: 14, bottom: 24, left: 44 };

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(320);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** A clean top for the y-axis: 1, 2, 2.5 or 5 × a power of ten. */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 2.5, 5, 10].find((m) => m * p >= v) ?? 10) * p;
}

/**
 * Spending so far, added up day by day: this month (the accent, with a soft
 * wash and its latest value labelled) against last month (de-emphasis grey).
 * A crosshair follows the finger or pointer and reads out both months on
 * that day. Fixed bills are left out: they're monthly, not spread over days.
 */
export function CumulativeLine({
  thisMonth,
  lastMonth,
  daysInMonth,
  currency,
  thisLabel,
  lastLabel,
}: {
  /** Running total for each day so far (index 0 = the 1st). */
  thisMonth: number[];
  /** Running total for every day of last month. */
  lastMonth: number[];
  daysInMonth: number;
  currency: string;
  thisLabel: string;
  lastLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hoverDay, setHoverDay] = useState<number | null>(null);
  const days = Math.max(daysInMonth, lastMonth.length, 1);
  const yMax = niceMax(Math.max(1, ...thisMonth, ...lastMonth));
  const plotW = Math.max(10, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (day: number) => PAD.left + ((day - 1) / Math.max(days - 1, 1)) * plotW;
  const y = (v: number) => PAD.top + plotH - (v / yMax) * plotH;
  const path = (values: number[]) => values.map((v, i) => `${i ? "L" : "M"}${x(i + 1)} ${y(v)}`).join("");
  const last = thisMonth.length;

  function pick(clientX: number, target: SVGSVGElement) {
    const left = target.getBoundingClientRect().left;
    const day = Math.round(((clientX - left - PAD.left) / plotW) * (days - 1)) + 1;
    setHoverDay(Math.min(days, Math.max(1, day)));
  }

  const hover = hoverDay
    ? { day: hoverDay, now: thisMonth[hoverDay - 1], before: lastMonth[hoverDay - 1] }
    : null;
  const tipLeft = hover ? Math.min(Math.max(x(hover.day) - 70, 0), width - 140) : 0;

  return (
    <div>
      <div className="mb-3 flex gap-4 text-[12px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-[2px] w-4 rounded" style={{ backgroundColor: ACCENT }} aria-hidden="true" />
          {thisLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-[2px] w-4 rounded" style={{ backgroundColor: MUTED }} aria-hidden="true" />
          {lastLabel}
        </span>
      </div>
      <div ref={ref} className="relative w-full">
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`Spending added up day by day. ${thisLabel}: ${formatMoney(thisMonth[last - 1] ?? 0, currency)} by day ${last}.`}
          style={{ touchAction: "pan-y" }}
          onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
          onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
          onPointerLeave={() => setHoverDay(null)}
        >
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={PAD.left} x2={PAD.left + plotW} y1={y(yMax * f)} y2={y(yMax * f)} stroke="#2A2A2E" strokeWidth={1} />
              <text x={PAD.left - 6} y={y(yMax * f)} textAnchor="end" dominantBaseline="central" fontSize={11} fill="#71717A" className="tabular-nums">
                {compactMoney(yMax * f, currency)}
              </text>
            </g>
          ))}
          {[1, 8, 15, 22, 29].filter((d) => d <= days).map((d) => (
            <text key={d} x={x(d)} y={HEIGHT - 6} textAnchor="middle" fontSize={11} fill="#71717A">
              {d}
            </text>
          ))}

          {lastMonth.length > 0 && <path d={path(lastMonth)} fill="none" stroke={MUTED} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          {last > 0 && (
            <>
              <path d={`${path(thisMonth)}L${x(last)} ${y(0)}L${x(1)} ${y(0)}Z`} fill={ACCENT} opacity={0.1} />
              <path d={path(thisMonth)} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={x(last)} cy={y(thisMonth[last - 1])} r={4} fill={ACCENT} stroke={SURFACE} strokeWidth={2} />
            </>
          )}

          {hover && (
            <g pointerEvents="none">
              <line x1={x(hover.day)} x2={x(hover.day)} y1={PAD.top} y2={PAD.top + plotH} stroke="#A1A1AA" strokeWidth={1} />
              {hover.before !== undefined && <circle cx={x(hover.day)} cy={y(hover.before)} r={4} fill={MUTED} stroke={SURFACE} strokeWidth={2} />}
              {hover.now !== undefined && <circle cx={x(hover.day)} cy={y(hover.now)} r={4} fill={ACCENT} stroke={SURFACE} strokeWidth={2} />}
            </g>
          )}
        </svg>

        {hover && (
          <div
            className="pointer-events-none absolute top-0 w-[140px] rounded-lg border border-line bg-raised px-2.5 py-2 text-[12px] shadow-lg"
            style={{ left: tipLeft }}
            role="status"
          >
            <p className="text-muted">Day {hover.day}</p>
            {[
              { v: hover.now, label: thisLabel, color: ACCENT },
              { v: hover.before, label: lastLabel, color: MUTED },
            ].map((row) =>
              row.v === undefined ? null : (
                <p key={row.label} className="mt-0.5 flex items-center gap-1.5">
                  <span className="h-[2px] w-3 shrink-0 rounded" style={{ backgroundColor: row.color }} aria-hidden="true" />
                  <span className="font-semibold tabular-nums">{formatMoney(row.v, currency)}</span>
                  <span className="truncate text-muted">{row.label}</span>
                </p>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
