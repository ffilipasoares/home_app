import { useEffect, useState, type ReactNode } from "react";
import { Loader2Icon, WalletIcon } from "lucide-react";
import { useAuth } from "../lib/auth";
import { seedUserIfMissing } from "../lib/settings";
import { Button } from "./ui/Button";
import { TabBar } from "./TabBar";

function CenteredScreen({ children }: { children: ReactNode }) {
  return (
    <main className="pt-safe flex min-h-screen w-full flex-col items-center justify-center bg-canvas px-6 text-center text-ink">
      {children}
    </main>
  );
}

function AppMark() {
  return (
    <span className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-accent text-canvas" aria-hidden="true">
      <WalletIcon className="h-8 w-8" strokeWidth={2} />
    </span>
  );
}

/** Gates the whole app behind Firebase Auth + the single allow-listed email.
 * This is a UX convenience, not the security boundary — Firestore security
 * rules enforce the same restriction server-side regardless of what this
 * component does. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status, user, error, signIn, signOut } = useAuth();
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    if (status === "ready" && user) {
      seedUserIfMissing(user.uid).catch((err) => console.error("seedUserIfMissing failed", err));
    }
  }, [status, user]);

  if (status === "loading") {
    return (
      <CenteredScreen>
        <Loader2Icon className="h-7 w-7 animate-spin text-muted" aria-label="Loading" />
      </CenteredScreen>
    );
  }

  if (status === "signed-out") {
    return (
      <CenteredScreen>
        <AppMark />
        <h1 className="mt-6 text-[28px] font-bold tracking-tight">Home Finance</h1>
        <p className="mt-2 max-w-[300px] text-[15px] text-muted">
          Sign in with the Google account this app is set up for.
        </p>
        <Button
          className="mt-8 w-full max-w-[320px]"
          disabled={signingIn}
          onClick={() => {
            setSigningIn(true);
            signIn().catch(() => setSigningIn(false));
          }}
        >
          {signingIn && <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {signingIn ? "Signing in" : "Sign in with Google"}
        </Button>
        {error && (
          <p role="alert" className="mt-4 max-w-[320px] text-sm text-negative">
            {error}
          </p>
        )}
      </CenteredScreen>
    );
  }

  if (status === "not-allowed") {
    return (
      <CenteredScreen>
        <AppMark />
        <h1 className="mt-6 text-[28px] font-bold tracking-tight">Not authorized</h1>
        <p className="mt-2 max-w-[320px] text-[15px] text-muted">
          Signed in as {user?.email}, which isn't the account this app is configured for.
        </p>
        <Button variant="secondary" className="mt-8 w-full max-w-[320px]" onClick={() => signOut()}>
          Sign out
        </Button>
      </CenteredScreen>
    );
  }

  return (
    <div className="flex min-h-screen w-full justify-center bg-canvas text-ink">
      <div className="relative flex min-h-screen w-full max-w-[440px] flex-col">
        <main className="flex-1 pb-28">{children}</main>
        <TabBar />
      </div>
    </div>
  );
}
