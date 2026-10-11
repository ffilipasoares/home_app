import { motion } from "framer-motion";
import { formatMoney } from "../../lib/format";

/** One bar splitting the month's income into spent, fixed bills, the savings goal and what's free. */
export function IncomeAllocation({
  income,
  spent,
  fixed,
  goal,
  saved,
  currency,
}: {
  income: number;
  spent: number;
  fixed: number;
  goal: number;
  /** income − spent − fixed */
  saved: number;
  currency: string;
}) {
  const goalPart = Math.max(0, Math.min(goal, saved));
  const free = Math.max(0, saved - goal);
  const segments = [
    { key: "spent", label: "Spent", amount: spent, color: "bg-coral" },
    { key: "fixed", label: "Fixed bills", amount: fixed, color: "bg-subtle" },
    { key: "goal", label: "Savings goal", amount: goalPart, color: "bg-violet" },
    { key: "free", label: "Free to spend", amount: free, color: "bg-accent" },
  ];
  const total = Math.max(income, spent + fixed + goalPart + free) || 1;

  return (
    <div className="mt-6 px-1">
      <h2 className="text-base font-semibold">Where your income goes</h2>
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
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3">
        {segments.map((s) => (
          <div key={s.key} className="min-w-0">
            <dt className="flex items-center gap-2 whitespace-nowrap text-[13px] text-muted">
              <span className={`h-2 w-2 shrink-0 rounded-full ${s.color}`} aria-hidden="true" />
              {s.label}
            </dt>
            <dd className="mt-0.5 truncate pl-4 text-[15px] font-semibold tabular-nums text-ink">
              {formatMoney(s.amount, currency)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
