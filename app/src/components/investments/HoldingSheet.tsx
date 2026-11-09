import { useEffect, useState } from "react";
import { BottomSheet, SheetBody } from "../ui/BottomSheet";
import { SegmentedControl } from "../ui/SegmentedControl";
import { ValueLine, type TimeFormat } from "./ValueLine";
import { formatCurrency, formatMoney } from "../../lib/format";
import { fetchPriceHistory, type PriceHistory, type PriceRange } from "../../lib/investments";
import type { DisplayCurrency, ValuedHolding } from "../../types";

const RANGES: { value: PriceRange; label: string; format: TimeFormat; name: string }[] = [
  { value: "1d", label: "1D", format: "time", name: "today" },
  { value: "1mo", label: "1M", format: "day", name: "in a month" },
  { value: "6mo", label: "6M", format: "day", name: "in 6 months" },
  { value: "1y", label: "1Y", format: "day", name: "in a year" },
  { value: "5y", label: "5Y", format: "month", name: "in 5 years" },
];

/**
 * One share or fund: its price over the chosen range (in its own currency,
 * as the exchange quotes it), how much it moved, and your position in it.
 */
export function HoldingSheet({
  holding,
  accountLabel,
  currency,
  onClose,
}: {
  holding: ValuedHolding | null;
  accountLabel: string;
  currency: DisplayCurrency;
  onClose: () => void;
}) {
  return (
    <BottomSheet open={holding !== null} onClose={onClose} title={holding?.name ?? ""}>
      {holding && <HoldingBody key={holding.symbol} holding={holding} accountLabel={accountLabel} currency={currency} />}
    </BottomSheet>
  );
}

function HoldingBody({ holding, accountLabel, currency }: { holding: ValuedHolding; accountLabel: string; currency: DisplayCurrency }) {
  const [range, setRange] = useState<PriceRange>("1y");
  const [history, setHistory] = useState<Record<string, PriceHistory>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const data = history[range];
  const error = errors[range];

  // Each range is fetched once, the first time it's picked.
  useEffect(() => {
    if (history[range] || errors[range]) return;
    let cancelled = false;
    fetchPriceHistory(holding, range)
      .then((h) => !cancelled && setHistory((prev) => ({ ...prev, [range]: h })))
      .catch(
        (err) => !cancelled && setErrors((prev) => ({ ...prev, [range]: err instanceof Error ? err.message : String(err) })),
      );
    return () => {
      cancelled = true;
    };
  }, [holding, range, history, errors]);

  const first = data?.points[0]?.price;
  const last = data?.points[data.points.length - 1]?.price;
  const change = first !== undefined && last !== undefined ? last - first : undefined;
  const pct = change !== undefined && first ? change / first : undefined;
  const rangeInfo = RANGES.find((r) => r.value === range)!;
  const value = holding.valueIn?.[currency];
  const invested = holding.investedIn?.[currency];

  return (
    <SheetBody>
      <div>
        <p className="text-[13px] text-muted">
          {data?.symbol ?? holding.symbol} · {accountLabel}
        </p>
        <p className="mt-1 text-[32px] font-bold leading-tight tabular-nums">
          {last !== undefined && data ? formatCurrency(last, data.currency) : "—"}
        </p>
        {change !== undefined && pct !== undefined && data && (
          <p className="text-[15px]">
            <span className={`font-semibold tabular-nums ${change >= 0 ? "text-positive" : "text-negative"}`}>
              {formatMoney(change, data.currency, { signed: true })} ({change >= 0 ? "+" : "−"}
              {Math.abs(pct * 100).toFixed(2)}%)
            </span>{" "}
            <span className="text-muted">{rangeInfo.name}</span>
          </p>
        )}
      </div>

      <SegmentedControl<PriceRange>
        label="Chart range"
        value={range}
        onChange={setRange}
        options={RANGES.map((r) => ({ value: r.value, label: r.label }))}
      />

      <div className="min-h-[180px] rounded-2xl bg-raised p-3">
        {data && data.points.length >= 2 ? (
          <ValueLine
            points={data.points.map((p) => ({ t: p.t, value: p.price }))}
            currency={data.currency}
            timeFormat={rangeInfo.format}
            label="Price"
          />
        ) : (
          <p className="py-16 text-center text-sm text-muted">{error ?? "Loading prices…"}</p>
        )}
      </div>
      {data && <p className="text-[12px] text-subtle">Price in {data.currency}, as the exchange quotes it. Prices can be delayed by up to 20 minutes.</p>}

      <div className="divide-y divide-line overflow-hidden rounded-xl bg-raised">
        <Row label="Shares" value={holding.quantity.toLocaleString(undefined, { maximumFractionDigits: 6 })} />
        <Row label="Your position" value={value !== undefined ? formatMoney(value, currency) : "—"} />
        {invested !== undefined && value !== undefined && (
          <Row
            label="Gain on what you paid"
            value={
              <span className={value - invested >= 0 ? "text-positive" : "text-negative"}>
                {formatMoney(value - invested, currency, { signed: true })}
              </span>
            }
          />
        )}
      </div>
    </SheetBody>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 text-[15px]">
      <span className="text-muted">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}
