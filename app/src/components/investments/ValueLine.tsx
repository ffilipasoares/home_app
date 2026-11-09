import { useEffect, useRef, useState } from "react";
import { ACCENT, SURFACE, compactMoney } from "../../lib/chartColors";
import { formatMoney } from "../../lib/format";
import { formatShortDate } from "../../lib/month";

const HEIGHT = 180;
const PAD = { top: 16, right: 14, bottom: 24, left: 48 };

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

/**
 * Total value day by day: one series in the accent with a soft wash, the
 * latest point marked, a crosshair that reads out the date and value. The
 * y-axis starts near the lowest value rather than 0, so day-to-day moves
 * are visible; its three ticks say where it starts.
 */
export function ValueLine({ points, currency }: { points: { date: string; value: number }[]; currency: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const values = points.map((p) => p.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || Math.max(hi * 0.05, 1);
  const yMin = Math.max(0, lo - span * 0.15);
  const yMax = hi + span * 0.15;
  const plotW = Math.max(10, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const n = points.length;
  const x = (i: number) => PAD.left + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2);
  const y = (v: number) => PAD.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i)} ${y(p.value)}`).join("");
  const last = n - 1;
  const ticks = [0, Math.floor(last / 2), last].filter((v, i, a) => a.indexOf(v) === i);

  function pick(clientX: number, target: SVGSVGElement) {
    const left = target.getBoundingClientRect().left;
    const i = Math.round(((clientX - left - PAD.left) / plotW) * (n - 1));
    setHover(Math.min(last, Math.max(0, i)));
  }

  const tipLeft = hover !== null ? Math.min(Math.max(x(hover) - 70, 0), width - 140) : 0;

  return (
    <div ref={ref} className="relative w-full">
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={`Total value from ${formatShortDate(points[0].date)} (${formatMoney(points[0].value, currency)}) to ${formatShortDate(points[last].date)} (${formatMoney(points[last].value, currency)}).`}
        style={{ touchAction: "pan-y" }}
        onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
        onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
        onPointerLeave={() => setHover(null)}
      >
        {[0, 0.5, 1].map((f) => {
          const v = yMin + (yMax - yMin) * f;
          return (
            <g key={f}>
              <line x1={PAD.left} x2={PAD.left + plotW} y1={y(v)} y2={y(v)} stroke="#2A2A2E" strokeWidth={1} />
              <text x={PAD.left - 6} y={y(v)} textAnchor="end" dominantBaseline="central" fontSize={11} fill="#71717A" className="tabular-nums">
                {compactMoney(v, currency)}
              </text>
            </g>
          );
        })}
        {ticks.map((i) => (
          <text
            key={i}
            x={x(i)}
            y={HEIGHT - 6}
            textAnchor={i === 0 && n > 1 ? "start" : i === last && n > 1 ? "end" : "middle"}
            fontSize={11}
            fill="#71717A"
          >
            {formatShortDate(points[i].date).replace(/ \d{4}$/, "")}
          </text>
        ))}

        {n > 1 && (
          <>
            <path d={`${line}L${x(last)} ${y(yMin)}L${x(0)} ${y(yMin)}Z`} fill={ACCENT} opacity={0.1} />
            <path d={line} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          </>
        )}
        <circle cx={x(last)} cy={y(points[last].value)} r={4} fill={ACCENT} stroke={SURFACE} strokeWidth={2} />

        {hover !== null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} stroke="#A1A1AA" strokeWidth={1} />
            <circle cx={x(hover)} cy={y(points[hover].value)} r={4} fill={ACCENT} stroke={SURFACE} strokeWidth={2} />
          </g>
        )}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-0 w-[140px] rounded-lg border border-line bg-raised px-2.5 py-2 text-[12px] shadow-lg"
          style={{ left: tipLeft }}
          role="status"
        >
          <p className="text-muted">{formatShortDate(points[hover].date)}</p>
          <p className="mt-0.5 font-semibold tabular-nums">{formatMoney(points[hover].value, currency)}</p>
        </div>
      )}
    </div>
  );
}
