import type { CategoryDef } from "../types";

// Default taxonomy from docs/ARCHITECTURE.md §7. Seeded once into
// users/{uid}/settings/categories on first sign-in (see seedDefaultCategories
// in lib/settings.ts) and fully editable afterwards — nothing downstream
// hardcodes these ids beyond the two special ones below.
export const DEFAULT_CATEGORIES: CategoryDef[] = [
  { id: "housing", label: "Housing (rent/mortgage)", needed: true },
  { id: "utilities", label: "Utilities", needed: true },
  { id: "groceries", label: "Groceries", needed: true },
  { id: "transport", label: "Transport", needed: true },
  { id: "health", label: "Health & Insurance", needed: true },
  { id: "debt", label: "Debt / Loan payments", needed: true },
  { id: "education", label: "Education / Childcare", needed: true },
  { id: "dining", label: "Dining Out & Takeaway", needed: false },
  { id: "entertainment", label: "Entertainment & Leisure", needed: false },
  { id: "shopping", label: "Shopping", needed: false },
  { id: "subscriptions", label: "Subscriptions", needed: false },
  { id: "travel", label: "Travel / Holidays", needed: false },
  { id: "savings_transfer", label: "Savings / Investment transfer", needed: true, special: "savings" },
  { id: "income", label: "Income / Salary", needed: true, special: "income" },
  { id: "other", label: "Other / Uncategorized", needed: false },
];

export const UNCATEGORIZED_ID = "other";
