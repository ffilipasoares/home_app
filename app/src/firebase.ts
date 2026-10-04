import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

// All values come from app/.env.local (see app/.env.example + SETUP.md).
// None of this is a secret in the traditional sense — a Firebase web config
// is meant to be public — access control lives in Firestore security rules
// and the single-allow-listed-email check in lib/auth.tsx, not in hiding
// these values.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  // In the deployed app, sign-in goes through Firebase's /__/auth handler on
  // the app's own domain rather than <project>.firebaseapp.com. Browsers now
  // block the cross-site storage the redirect sign-in relies on, which
  // silently drops you back on the sign-in screen when the two differ.
  // Firebase Hosting serves /__/auth on every domain it hosts, so this works
  // for web.app and any custom domain; local dev keeps the configured value.
  // Needs https://<this domain>/__/auth/handler listed as an authorized
  // redirect URI on the project's OAuth client (SETUP.md §4).
  authDomain: import.meta.env.PROD ? window.location.host : import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);
export const googleProvider = new GoogleAuthProvider();
// Always show Google's account picker instead of silently reusing the last
// account, so you can choose (or switch) which Google account signs in.
googleProvider.setCustomParameters({ prompt: "select_account" });

/** The only email allowed to use this app — set to your own address. */
// Compared case-insensitively and without surrounding spaces or quotes, so a
// small formatting difference in .env.local can't lock you out.
export const ALLOWED_EMAIL = String(import.meta.env.VITE_ALLOWED_EMAIL ?? "")
  .trim()
  .replace(/^["']|["']$/g, "")
  .toLowerCase();
