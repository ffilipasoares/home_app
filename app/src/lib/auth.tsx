import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { auth, googleProvider, ALLOWED_EMAIL } from "../firebase";

type AuthStatus = "loading" | "signed-out" | "not-allowed" | "ready";

type AuthContextValue = {
  status: AuthStatus;
  user: User | null;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Surfaces failures from the redirect round-trip itself (e.g. a
    // misconfigured authorized domain) — separate from onAuthStateChanged,
    // which only reports the resulting signed-in/out state, not why a
    // sign-in attempt failed.
    getRedirectResult(auth).catch((err) => {
      console.error("getRedirectResult failed", err);
      setError(err instanceof Error ? err.message : String(err));
    });

    return onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        setStatus("signed-out");
      } else if (firebaseUser.email !== ALLOWED_EMAIL) {
        setStatus("not-allowed");
      } else {
        setStatus("ready");
      }
    });
  }, []);

  const value: AuthContextValue = {
    status,
    user,
    error,
    signIn: async () => {
      // A popup is unreliable inside an installed (standalone-display) PWA
      // on iOS Safari — WKWebView doesn't give the OAuth popup a real
      // window, so it can hang or silently fail. Redirect works everywhere
      // popup does and is the only reliable option once you've installed
      // this to your home screen, so it's the only path here rather than
      // popup-with-redirect-fallback.
      await signInWithRedirect(auth, googleProvider);
    },
    signOut: async () => {
      await firebaseSignOut(auth);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
