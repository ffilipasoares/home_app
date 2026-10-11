import { Link } from "react-router-dom";
import { formatMoney } from "../../lib/format";
import { SectionHeader } from "../ui/ValueRow";

/**
 * The goal next to what was actually saved (income − spending − fixed
 * expenses): "saved so far" while the month runs, the month's result once
 * it's over, with how far above or below the goal that is.
 */
export function SavingsGoalSection({
  saved,
  goal,
  monthOver,
  currency,
}: {
  saved: number;
  goal: number;
  monthOver: boolean;
  currency: string;
}) {
  const fmt = (n: number) => formatMoney(n, currency);
  const reached = saved >= goal;
  const pct = goal > 0 ? Math.min(100, Math.max(0, (saved / goal) * 100)) : 0;
  const gap = fmt(Math.abs(saved - goal));
  const status = monthOver
    ? reached
      ? `Goal reached: ${gap} above the goal.`
      : `${gap} short of the goal.`
    : reached
      ? `On track: ${gap} above the goal so far.`
      : `${gap} to go to reach the goal.`;

  return (
    <section aria-labelledby="goal-heading">
      <SectionHeader id="goal-heading" title="Savings goal" />
      {goal <= 0 ? (
        <p className="mt-3 rounded-2xl bg-surface px-4 py-6 text-center text-sm text-muted">
          No savings goal set.{" "}
          <Link to="/settings" className="font-medium text-accent hover:underline">
            Add one in Settings
          </Link>
        </p>
      ) : (
        <div className="mt-3 rounded-2xl bg-surface p-4">
          <dl className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-[13px] text-muted">Goal</dt>
              <dd className="mt-0.5 font-display text-xl font-bold tabular-nums">{fmt(goal)}</dd>
            </div>
            <div>
              <dt className="text-[13px] text-muted">{monthOver ? "Saved" : "Saved so far"}</dt>
              <dd className={`mt-0.5 font-display text-xl font-bold tabular-nums ${saved < 0 ? "text-negative" : ""}`}>
                {fmt(saved)}
              </dd>
            </div>
          </dl>
          <div
            className="mt-4 h-2 overflow-hidden rounded-full bg-raised"
            role="meter"
            aria-label="Saved against the goal"
            aria-valuemin={0}
            aria-valuemax={goal}
            aria-valuenow={Math.max(0, saved)}
          >
            <div className={`h-full rounded-full ${reached ? "bg-accent" : "bg-violet"}`} style={{ width: `${pct}%` }} />
          </div>
          <p className={`mt-3 text-[13px] font-medium ${reached ? "text-positive" : "text-muted"}`}>{status}</p>
        </div>
      )}
    </section>
  );
}
