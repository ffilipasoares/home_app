import { useState } from "react";
import { formatMoney } from "../../lib/format";

export type Part = { id: string; label: string; amount: number; color: string; note?: string; emphasis?: boolean };

const pct = (share: number) => `${Math.round(share * 100)}%`;

/**
 * One 100% bar: the shares of income each part takes (here the projected
 * spending per category, then estimated savings). A 2px surface gap between
 * segments; a % sits inside a segment only when it's wide enough; the
 * legend below lists every part with its share and amount (the table view).
 * Tap or hover a segment or row to pick it out.
 */
export function IncomeSplitBar({ parts, base, currency }: { parts: Part[]; base: number; currency: string }) {
  const [active, setActive] = useState<string | null>(null);
  const visible = parts.filter((p) => p.amount > 0);
  const sum = visible.reduce((s, p) => s + p.amount, 0);
  // Normally the parts add up to income; if spending runs past income the bar shows spending instead.
  const scale = Math.max(base, sum) || 1;

  return (
    <div>
      <div className="flex h-6 w-full gap-[2px] overflow-hidden rounded-[4px]" role="img" aria-label={visible.map((p) => `${p.label} ${pct(p.amount / base)}`).join(", ")}>
        {visible.map((p) => {
          const share = p.amount / scale;
          return (
            <div
              key={p.id}
              className="flex h-full cursor-pointer items-center justify-center text-[11px] font-semibold transition-opacity duration-150"
              style={{
                width: `${share * 100}%`,
                backgroundColor: p.color,
                color: p.emphasis ? "#0B0B0C" : "#FFFFFF",
                opacity: active !== null && active !== p.id ? 0.35 : 1,
              }}
              onPointerEnter={() => setActive(p.id)}
              onPointerLeave={() => setActive(null)}
              onClick={() => setActive((v) => (v === p.id ? null : p.id))}
            >
              {share >= 0.14 && pct(p.amount / base)}
            </div>
          );
        })}
      </div>

      <ul className="mt-4 divide-y divide-line">
        {parts.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => setActive(p.id)}
              onFocus={() => setActive(p.id)}
              onBlur={() => setActive(null)}
              aria-pressed={active === p.id}
              className={`flex w-full items-center gap-3 px-1 py-2.5 text-left transition-colors focus-visible:outline-none ${
                active === p.id ? "bg-raised" : ""
              }`}
            >
              <span className="h-3 w-3 shrink-0 rounded-[3px]" style={{ backgroundColor: p.color }} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-[14px] ${p.emphasis ? "font-semibold" : ""}`}>{p.label}</span>
                {p.note && <span className="block truncate text-[12px] text-muted">{p.note}</span>}
              </span>
              <span className="w-12 shrink-0 text-right text-[13px] tabular-nums text-muted">{base > 0 ? pct(p.amount / base) : "—"}</span>
              <span className={`w-24 shrink-0 text-right text-[14px] tabular-nums ${p.emphasis ? "font-semibold" : "font-medium"}`}>
                {formatMoney(p.amount, currency)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
