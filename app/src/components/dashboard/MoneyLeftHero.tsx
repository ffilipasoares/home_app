import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";
import { AlertTriangleIcon, SparklesIcon } from "lucide-react";
import { formatMoney } from "../../lib/format";

/**
 * The big number: money left after spending, fixed expenses and the
 * savings goal (set aside first). Lime while it's 0 or more, coral when
 * the month has eaten into the goal.
 */
export function MoneyLeftHero({ moneyLeft, goal, currency }: { moneyLeft: number; goal: number; currency: string }) {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(moneyLeft);
  const fromRef = useRef(moneyLeft);
  const onTrack = moneyLeft >= 0;
  const fmt = (n: number) => formatMoney(n, currency);

  useEffect(() => {
    const controls = animate(fromRef.current, moneyLeft, {
      duration: reduceMotion ? 0 : 0.3,
      ease: [0.23, 1, 0.32, 1],
      onUpdate: setDisplay,
    });
    fromRef.current = moneyLeft;
    return () => controls.stop();
  }, [moneyLeft, reduceMotion]);

  return (
    <section
      aria-labelledby="money-left-label"
      className={`rounded-[28px] p-6 text-canvas transition-colors duration-200 ${onTrack ? "bg-accent" : "bg-coral"}`}
    >
      <div className="flex items-center justify-between gap-3">
        <p id="money-left-label" className="text-sm font-semibold">
          Money left
        </p>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-canvas/10 px-2.5 py-1 text-xs font-semibold">
          {onTrack ? (
            <SparklesIcon className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <AlertTriangleIcon className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {onTrack ? "On track" : goal > 0 ? "Behind goal" : "Overspent"}
        </span>
      </div>
      <p className="mt-4 font-display text-[44px] font-bold leading-none tracking-tight tabular-nums sm:text-[52px]" aria-live="polite">
        {fmt(display)}
      </p>
      <p className="mt-4 text-[15px] font-medium text-canvas/75">
        {goal <= 0 ? (
          "No savings goal set."
        ) : onTrack ? (
          <>
            Free to spend after your <span className="font-bold text-canvas">{fmt(goal)}</span> savings goal
          </>
        ) : (
          <>
            <span className="font-bold text-canvas">{fmt(-moneyLeft)}</span> short of your {fmt(goal)} savings goal
          </>
        )}
      </p>
    </section>
  );
}
