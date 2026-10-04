import { collection, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase";
import type { AccountLink } from "../types";

const CALLBACK_KEY = "bankCallbackSearch";
// The first sync imports ~90 days of history; matches the functions'
// timeout_sec (functions/main.py).
const LONG_CALL = { timeout: 540_000 };

export type FinishResult = { accounts: number; imported: number };

/**
 * Revolut sends you back to /bank-callback?code=…&state=…, a real path,
 * while this app routes on the URL hash. Called once before the app
 * renders: stashes the query (sessionStorage survives a Google sign-in
 * redirect in the same tab) and switches to the #/bank-callback route.
 */
export function captureBankCallback(): void {
  if (window.location.pathname !== "/bank-callback") return;
  sessionStorage.setItem(CALLBACK_KEY, window.location.search);
  window.history.replaceState(null, "", "/#/bank-callback");
}

let inFlight: Promise<FinishResult> | null = null;

/**
 * Finishes the connection the bank just sent you back from, at most once
 * per callback (the code and state are single-use). Returns null when
 * there's nothing to finish, e.g. the page was reloaded afterwards.
 */
export function finishPendingBankCallback(): Promise<FinishResult> | null {
  if (inFlight) return inFlight;
  const search = sessionStorage.getItem(CALLBACK_KEY);
  if (search === null) return null;
  sessionStorage.removeItem(CALLBACK_KEY);

  const params = new URLSearchParams(search);
  const error = params.get("error");
  const code = params.get("code");
  const state = params.get("state");
  if (error) {
    inFlight = Promise.reject(new Error(params.get("error_description") || `The bank returned: ${error}`));
  } else if (!code || !state) {
    inFlight = Promise.reject(new Error("The bank didn't send back a code. Start again from Settings."));
  } else {
    const call = httpsCallable<{ code: string; state: string }, FinishResult>(functions, "bank_connect_finish", LONG_CALL);
    inFlight = call({ code, state }).then((res) => res.data);
  }
  return inFlight;
}

/** Starts a Revolut consent and sends the browser to the bank. */
export async function startBankConnect(): Promise<void> {
  const call = httpsCallable<void, { url: string }>(functions, "bank_connect_start");
  const { data } = await call();
  window.location.assign(data.url);
}

/** Runs the same import as the daily job, now. Returns how many new transactions arrived. */
export async function syncBankNow(): Promise<number> {
  const call = httpsCallable<void, { imported: number }>(functions, "bank_sync_now", LONG_CALL);
  const { data } = await call();
  return data.imported;
}

export function subscribeBankAccounts(uid: string, cb: (accounts: AccountLink[]) => void) {
  return onSnapshot(
    collection(db, "users", uid, "accounts"),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AccountLink)),
    (err) => console.error("subscribeBankAccounts failed", err),
  );
}
