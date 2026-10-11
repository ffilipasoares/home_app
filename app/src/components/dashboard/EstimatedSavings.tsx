import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDownIcon } from "lucide-react";
import { CategoryIcon } from "../CategoryIcon";
import { SectionHeader } from "../ui/ValueRow";
import { formatMoney } from "../../lib/format";
import { MONTH_DAYS, daysSinceMonthStart, projectMonth } from "../../lib/projection";
import type { CategoryDef } from "../../types";

const pct = (share: number) => `${Math.round(share * 100)}%`;

export function EstimatedSavings({
  spentByCategory,
  fixedCategoryIds,
  income,
  month,
  currency,
  categoryById,
  categoryLabel,
}: {
  spentByCategory: [string, number][];
  fixedCategoryIds: Set<string>;
  income: number;
  month: string;
  currency: string;
  categoryById: (id: string) => CategoryDef | undefined;
  categoryLabel: (id: string) => string;
}) {
  const days = daysSinceMonthStart(month);
  const { rows, total, savings, savingsShare } = projectMonth(spentByCategory, fixedCategoryIds, income, days);
  const fmt = (n: number) => formatMoney(n, currency);
  const sorted = [...rows].sort((a, b) => b.estimate - a.estimate);
  // The per-category breakdown stays folded away until asked for.
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  return (
    <section aria-labelledby="estimate-heading">
      <SectionHeader
        id="estimate-heading"
        title="Estimated savings"
        note={
          days <= MONTH_DAYS
            ? `Spending so far projected to a ${MONTH_DAYS}-day month (day ${days}); categories with fixed expenses count as they are.`
            : "The month is complete, so these are the actual amounts."
        }
      />
      <div className="mt-3 overflow-hidden rounded-2xl bg-surface">
        <div className="flex items-end justify-between gap-3 px-4 pb-3 pt-4">
          <div>
            <p className="text-[13px] text-muted">Estimated savings</p>
            <p className={`mt-0.5 font-display text-[28px] font-bold leading-tight tabular-nums ${savings < 0 ? "text-negative" : "text-positive"}`}>
              {fmt(savings)}
            </p>
          </div>
          <p className="pb-1 text-right text-[13px] text-muted">
            <span className="text-[15px] font-semibold text-ink">{pct(savingsShare)}</span>
            <br />
            of income
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="estimate-breakdown"
          className="flex w-full items-center justify-between gap-3 border-t border-line px-4 py-3 text-left text-sm font-medium text-muted transition-colors hover:bg-raised hover:text-ink focus-visible:bg-raised focus-visible:outline-none"
        >
          <span>{open ? "Hide breakdown" : "Show breakdown"}</span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="tabular-nums">{fmt(total)} spending</span>
            <ChevronDownIcon className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden="true" />
          </span>
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              id="estimate-breakdown"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.23, 1, 0.32, 1] }}
              className="overflow-hidden"
            >
          <ul className="divide-y divide-line border-t border-line">
            {sorted.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <CategoryIcon category={categoryById(r.id)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{categoryLabel(r.id)}</span>
                  <span className="block truncate text-[13px] text-muted">
                    {r.fixed ? "Fixed, not projected" : `${fmt(r.spent)} so far`}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[15px] font-medium tabular-nums">{fmt(r.estimate)}</span>
                  <span className="block text-[12px] tabular-nums text-subtle">{pct(r.share)} of income</span>
                </span>
              </li>
            ))}
            <li className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[15px] font-semibold">Estimated spending</span>
              <span className="text-[15px] font-semibold tabular-nums">{fmt(total)}</span>
            </li>
          </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
