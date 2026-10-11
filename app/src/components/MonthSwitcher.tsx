import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useSelectedMonth } from "../lib/selectedMonth";
import { currentMonth, formatMonth, shiftMonth } from "../lib/month";

const ARROW =
  "flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors duration-150 hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-30";

/**
 * Previous/next month, shared by the Dashboard and Transactions (the
 * selected month is app-wide). Can't go past this month, or before
 * `firstMonth` (the oldest month with data) when given.
 */
export function MonthSwitcher({ variant = "title", firstMonth }: { variant?: "title" | "compact"; firstMonth?: string }) {
  const { month, setMonth } = useSelectedMonth();
  const label = formatMonth(month);
  const canGoNext = month < currentMonth();
  const canGoPrev = !firstMonth || month > firstMonth;

  const prev = (
    <button type="button" className={ARROW} onClick={() => setMonth(shiftMonth(month, -1))} disabled={!canGoPrev} aria-label="Previous month">
      <ChevronLeftIcon className="h-5 w-5" />
    </button>
  );
  const next = (
    <button type="button" className={ARROW} onClick={() => setMonth(shiftMonth(month, 1))} disabled={!canGoNext} aria-label="Next month">
      <ChevronRightIcon className="h-5 w-5" />
    </button>
  );

  if (variant === "compact") {
    return (
      <div className="flex items-center">
        {prev}
        <span className="min-w-[120px] text-center text-sm font-semibold" aria-live="polite">
          {label}
        </span>
        {next}
      </div>
    );
  }
  return (
    <div className="flex w-full items-center justify-between">
      <h1 className="text-[28px] font-bold tracking-tight" aria-live="polite">
        {label}
      </h1>
      <div className="flex items-center gap-1">
        {prev}
        {next}
      </div>
    </div>
  );
}
