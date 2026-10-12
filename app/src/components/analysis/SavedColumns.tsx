import { useState } from "react";
import { CheckIcon, MinusIcon } from "lucide-react";
import { ACCENT, MUTED, compactMoney } from "../../lib/chartColors";
import { formatMoney } from "../../lib/format";

export type MonthSaved = { month: string; label: string; fullLabel: string; saved: number; goal: number };

const HEIGHT = 170;
const PAD = { top: 20, bottom: 22 };
const BAR = 24;

/**
 * What was saved each month (income − spending − fixed bills), one column
 * per month on a single axis, with the savings goal as a solid hairline.
 * One series, so one colour: the accent, the month you're looking at a
 * shade stronger. The latest value is labelled on its cap; tap a column for
 * its value; the list underneath is the table view.
 */
export function SavedColumns({ months, selected, currency }: { months: MonthSaved[]; selected: string; currency: string }) {
  const [active, setActive] = useState<string | null>(null);
  const values = months.flatMap((m) => [m.saved, m.goal]);
  const top = Math.max(1, ...values);
  const bottom = Math.min(0, ...months.map((m) => m.saved));
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const y = (v: number) => PAD.top + ((top - v) / (top - bottom)) * plotH;
  const goal = months.find((m) => m.month === selected)?.goal ?? months[months.length - 1]?.goal ?? 0;
  const shown = months.find((m) => m.month === active);
  const slot = 100 / Math.max(months.length, 1);

  return (
    <div>
      <div className="relative w-full" style={{ height: HEIGHT }}>
        <svg className="absolute inset-0 h-full w-full overflow-visible" role="img" aria-label={months.map((m) => `${m.label} ${formatMoney(m.saved, currency)}`).join(", ")}>
          <line x1="0" x2="100%" y1={y(0)} y2={y(0)} stroke="#383835" strokeWidth={1} />
          {/* The goal line; its value is in the card's subtitle, so no label here to collide with a column. */}
          {goal > 0 && <line x1="0" x2="100%" y1={y(goal)} y2={y(goal)} stroke="#A1A1AA" strokeWidth={1} />}
        </svg>
        {months.map((m, i) => {
          const h = Math.abs(y(m.saved) - y(0));
          const up = m.saved >= 0;
          const isLatest = i === months.length - 1;
          return (
            <button
              key={m.month}
              type="button"
              className="absolute top-0 h-full focus-visible:outline-none"
              style={{ left: `${i * slot}%`, width: `${slot}%` }}
              onPointerEnter={() => setActive(m.month)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(m.month)}
              onBlur={() => setActive(null)}
              onClick={() => setActive((v) => (v === m.month ? null : m.month))}
              aria-label={`${m.label}: saved ${formatMoney(m.saved, currency)}`}
            >
              <span
                className="absolute left-1/2 -translate-x-1/2 transition-opacity duration-150"
                style={{
                  width: BAR,
                  top: up ? y(m.saved) : y(0),
                  height: Math.max(h, 1),
                  backgroundColor: m.saved < 0 ? MUTED : ACCENT,
                  opacity: m.month === selected || active === m.month ? 1 : 0.55,
                  borderRadius: up ? "4px 4px 0 0" : "0 0 4px 4px",
                }}
              />
              {(isLatest || active === m.month) && (
                <span
                  className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold tabular-nums text-ink"
                  style={{ top: up ? y(m.saved) - 16 : y(m.saved) + 2 }}
                >
                  {compactMoney(m.saved, currency)}
                </span>
              )}
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[11px] text-subtle">{m.label}</span>
            </button>
          );
        })}
      </div>
      {shown && (
        <p className="mt-2 text-center text-[13px] text-muted" role="status">
          {shown.label}: saved <span className="font-semibold text-ink">{formatMoney(shown.saved, currency)}</span>
          {shown.goal > 0 && <> · goal {formatMoney(shown.goal, currency)}</>}
        </p>
      )}
      <ul className="mt-4 divide-y divide-line">
        {[...months].reverse().map((m) => {
          const reached = m.goal > 0 && m.saved >= m.goal;
          return (
            <li key={m.month} className="flex items-center gap-3 px-1 py-2.5">
              <span className="min-w-0 flex-1 truncate text-[14px]">{m.fullLabel}</span>
              {m.goal > 0 && (
                <span className={`flex shrink-0 items-center gap-1 text-[12px] ${reached ? "text-positive" : "text-muted"}`}>
                  {reached ? <CheckIcon className="h-3.5 w-3.5" aria-hidden="true" /> : <MinusIcon className="h-3.5 w-3.5" aria-hidden="true" />}
                  {reached ? "Goal reached" : `${formatMoney(m.goal - m.saved, currency)} short`}
                </span>
              )}
              <span className="w-24 shrink-0 text-right text-[14px] font-medium tabular-nums">{formatMoney(m.saved, currency)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
