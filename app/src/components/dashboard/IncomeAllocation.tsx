import { motion } from "framer-motion";
import { PiggyBankIcon } from "lucide-react";
import { formatMoney } from "../../lib/format";

/** One bar splitting the month's income into spent (spending + fixed bills), the savings goal and what's free. */
export function IncomeAllocation({
  income,
  spent,
  goal,
  currency,
}: {
  income: number;
  /** Spending plus fixed bills. */
  spent: number;
  goal: number;
  currency: string;
}) {
  const saved = income - spent;
  const goalPart = Math.max(0, Math.min(goal, saved));
  const free = Math.max(0, saved - goal);
  const segments = [
    { key: "spent", label: "Spent", amount: spent, color: "bg-coral" },
    { key: "goal", label: "Savings goal", amount: goalPart, color: "bg-violet" },
    { key: "free", label: "Free to spend", amount: free, color: "bg-accent" },
  ];
  const total = Math.max(income, spent + goalPart + free) || 1;

  return (
    <div className="mt-6 px-1">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="whitespace-nowrap text-base font-semibold">Where your income goes</h2>
        {/* Total savings: the goal set aside plus what's still free to spend. */}
        <span
          className="flex shrink-0 items-center gap-1 text-[13px] font-medium tabular-nums text-muted"
          aria-label={`Saved ${formatMoney(goalPart + free, currency)}`}
          title="Saved: savings goal + free to spend"
        >
          <PiggyBankIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {formatMoney(goalPart + free, currency)}
        </span>
      </div>
      <div
        className="mt-3 flex h-3 w-full gap-[3px] overflow-hidden rounded-full bg-raised"
        role="img"
        aria-label={segments.map((s) => `${s.label} ${formatMoney(s.amount, currency)}`).join(", ")}
      >
        {segments
          .filter((s) => s.amount > 0)
          .map((s) => (
            <motion.div
              key={s.key}
              className={`h-full ${s.color}`}
              initial={false}
              animate={{ width: `${(s.amount / total) * 100}%` }}
              transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            />
          ))}
      </div>
      <dl className="mt-4 space-y-2.5">
        {segments.map((s) => (
          <div key={s.key} className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-2 text-[14px] text-muted">
              <span className={`h-2 w-2 shrink-0 rounded-full ${s.color}`} aria-hidden="true" />
              {s.label}
            </dt>
            <dd className="text-[15px] font-semibold tabular-nums text-ink">{formatMoney(s.amount, currency)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
