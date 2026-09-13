import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import type { MonthlyIncome } from "../types";

const EMPTY: MonthlyIncome = { filipaSalary: null, joaoSalary: null };

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

/** Writing here is what triggers the Cloud Function to recompute this month's dashboard (see functions/main.py's on_monthly_income_write). */
export async function saveMonthlyIncome(uid: string, month: string, income: MonthlyIncome): Promise<void> {
  await setDoc(monthlyIncomeRef(uid, month), income);
}
