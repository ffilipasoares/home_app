import { createContext, useContext } from "react";

/** The month the Dashboard and Transactions are showing; shared so switching page keeps it. */
export type SelectedMonth = { month: string; setMonth: (month: string) => void };

export const SelectedMonthContext = createContext<SelectedMonth | null>(null);

export function useSelectedMonth(): SelectedMonth {
  const ctx = useContext(SelectedMonthContext);
  if (!ctx) throw new Error("useSelectedMonth must be used within SelectedMonthProvider");
  return ctx;
}
