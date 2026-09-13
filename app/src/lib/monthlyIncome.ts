import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import type { MonthlyIncome } from "../types";

const EMPTY: MonthlyIncome = { salary: null, fixedIncomes: [] };

function monthlyIncomeRef(uid: string, month: string) {
  return doc(db, "users", uid, "monthlyIncome", month);
}

export function subscribeMonthlyIncome(
  uid: string,
  month: string,
  cb: (income: MonthlyIncome) => void,
) {
  return onSnapshot(
    monthlyIncomeRef(uid, month),
    (snap) => cb((snap.data() as MonthlyIncome | undefined) ?? EMPTY),
    (err) => console.error("subscribeMonthlyIncome failed", err),
  );
}

/** Writing here is what triggers the Cloud Function to recompute this month's dashboard (see functions/src/index.ts onMonthlyIncomeWrite). */
export async function saveMonthlyIncome(uid: string, month: string, income: MonthlyIncome): Promise<void> {
  await setDoc(monthlyIncomeRef(uid, month), income);
}

/** Convenience for the common case — fixed incomes (a partner's contribution) rarely change month to month, so offer to carry the previous month's list forward rather than retyping it. Salary is deliberately not copied: it's supposed to be confirmed each month, not silently repeated. */
export async function fetchPreviousMonthFixedIncomes(uid: string, previousMonth: string) {
  const snap = await getDoc(monthlyIncomeRef(uid, previousMonth));
  return (snap.data() as MonthlyIncome | undefined)?.fixedIncomes ?? [];
}
