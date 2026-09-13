import { useEffect, type ReactNode } from "react";
import { useAuth } from "../lib/auth";
import { seedUserIfMissing } from "../lib/settings";
import { NavBar } from "./NavBar";

/** Gates the whole app behind Firebase Auth + the single allow-listed email.
 * This is a UX convenience, not the security boundary — Firestore security
 * rules enforce the same restriction server-side regardless of what this
 * component does. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status, user, error, signIn, signOut } = useAuth();

  useEffect(() => {
    if (status === "ready" && user) {
      seedUserIfMissing(user.uid).catch((err) => console.error("seedUserIfMissing failed", err));
    }
  }, [status, user]);

  if (status === "loading") {
    return (
      <div className="screen">
        <p className="empty-state">Loading…</p>
      </div>
    );
  }

  if (status === "signed-out") {
    return (
      <div className="screen">
        <div className="card" style={{ marginTop: 80, textAlign: "center" }}>
          <h1>Home Finance</h1>
          <p style={{ color: "var(--text-secondary)" }}>Sign in with the Google account this app is set up for.</p>
          <button type="button" className="button" onClick={() => signIn()}>
            Sign in with Google
          </button>
          {error && (
            <p style={{ color: "var(--status-critical)", fontSize: 13, marginTop: 12 }}>{error}</p>
          )}
        </div>
      </div>
    );
  }

  if (status === "not-allowed") {
    return (
      <div className="screen">
        <div className="card" style={{ marginTop: 80, textAlign: "center" }}>
          <h1>Not authorized</h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Signed in as {user?.email}, which isn't the account this app is configured for.
          </p>
          <button type="button" className="button secondary" onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {children}
      <NavBar />
    </>
  );
}
