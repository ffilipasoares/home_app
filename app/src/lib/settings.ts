import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { DEFAULT_CATEGORIES } from "./categories";
import type { CategoryDef, UserSettings } from "../types";

const DEFAULT_SETTINGS: UserSettings = {
  savingsGoal: { type: "fixed", value: 0 },
  fixedExpenses: [],
};

function userRef(uid: string) {
  return doc(db, "users", uid);
}

function categoriesRef(uid: string) {
  return doc(db, "users", uid, "settings", "categories");
}

/** Fills in any field an older/partial doc is missing (e.g. fixedExpenses
 * didn't exist before this was added) rather than only falling back when
 * the whole doc is missing. */
function withDefaults(data: Partial<UserSettings> | undefined): UserSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...data,
    savingsGoal: { ...DEFAULT_SETTINGS.savingsGoal, ...data?.savingsGoal },
  };
}

/** Creates the user's profile + default category taxonomy the first time they sign in. Safe to call every sign-in — it never overwrites an existing doc. */
export async function seedUserIfMissing(uid: string): Promise<void> {
  const [userSnap, categoriesSnap] = await Promise.all([
    getDoc(userRef(uid)),
    getDoc(categoriesRef(uid)),
  ]);
  if (!userSnap.exists()) {
    await setDoc(userRef(uid), DEFAULT_SETTINGS);
  }
  if (!categoriesSnap.exists()) {
    await setDoc(categoriesRef(uid), { categories: DEFAULT_CATEGORIES });
  }
}

export function subscribeUserSettings(uid: string, cb: (settings: UserSettings) => void) {
  return onSnapshot(
    userRef(uid),
    (snap) => cb(withDefaults(snap.data() as Partial<UserSettings> | undefined)),
    (err) => console.error("subscribeUserSettings failed", err),
  );
}

export async function saveUserSettings(uid: string, settings: UserSettings): Promise<void> {
  await setDoc(userRef(uid), settings, { merge: true });
}

export function subscribeCategories(uid: string, cb: (categories: CategoryDef[]) => void) {
  return onSnapshot(
    categoriesRef(uid),
    (snap) => {
      const data = snap.data() as { categories: CategoryDef[] } | undefined;
      cb(data?.categories ?? DEFAULT_CATEGORIES);
    },
    (err) => console.error("subscribeCategories failed", err),
  );
}

export async function saveCategories(uid: string, categories: CategoryDef[]): Promise<void> {
  await setDoc(categoriesRef(uid), { categories });
}

export async function resetCategoriesToDefaults(uid: string): Promise<void> {
  await saveCategories(uid, DEFAULT_CATEGORIES);
}
