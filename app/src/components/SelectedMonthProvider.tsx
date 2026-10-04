import { useState, type ReactNode } from "react";
import { currentMonth } from "../lib/month";
import { SelectedMonthContext } from "../lib/selectedMonth";

const STORAGE_KEY = "selectedMonth";

function initialMonth(): string {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved && /^\d{4}-\d{2}$/.test(saved)) return saved;
  } catch {
    // Storage unavailable (e.g. private mode): just start on this month.
  }
  return currentMonth();
}

/** Holds the selected month for the whole app; remembered for the browser tab, so a reload keeps it. */
export function SelectedMonthProvider({ children }: { children: ReactNode }) {
  const [month, setMonthState] = useState(initialMonth);
  const setMonth = (next: string) => {
    setMonthState(next);
    try {
      sessionStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not critical: it's still shared while the app is open.
    }
  };
  return <SelectedMonthContext.Provider value={{ month, setMonth }}>{children}</SelectedMonthContext.Provider>;
}
