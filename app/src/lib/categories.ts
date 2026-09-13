import type { CategoryDef } from "../types";

// Default taxonomy — edit freely from Settings, or use its "Reset to
// defaults" button to snap back to this list. Nothing downstream hardcodes
// these ids beyond the two `special` ones (whichever category you mark
// "income"/"savings" drives the salary figure and the savings meter).
export const DEFAULT_CATEGORIES: CategoryDef[] = [
  { id: "salary", label: "Salary", special: "income" },
  { id: "food", label: "Food" },
  { id: "transport", label: "Transport" },
  { id: "needs", label: "Needs" },
  { id: "invest", label: "Invest", special: "savings" },
  { id: "entertainment", label: "Entertainment" },
  { id: "others", label: "Others" },
];

export const UNCATEGORIZED_ID = "others";
