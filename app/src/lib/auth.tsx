import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut, type User } from "firebase/auth";
import { auth, googleProvider, ALLOWED_EMAIL } from "../firebase";

type AuthStatus = "loading" | "signed-out" | "not-allowed" | "ready";

type AuthContextValue = {
  status: AuthStatus;
  user: User | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
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
    signIn: async () => {
      await signInWithPopup(auth, googleProvider);
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
