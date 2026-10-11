import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangleIcon, CheckCircle2Icon, Loader2Icon } from "lucide-react";
import { finishPendingBankCallback, type FinishResult } from "../lib/bank";
import { PageHeader } from "../components/ui/PageHeader";

type State = { kind: "working" } | { kind: "done"; result: FinishResult } | { kind: "error"; message: string } | { kind: "idle" };

const LINK =
  "mt-6 inline-flex h-12 w-full items-center justify-center rounded-xl bg-accent text-[15px] font-semibold text-canvas transition-colors hover:bg-accent-hover";

/** Where Revolut sends you back to after approving access (see captureBankCallback). */
export function BankCallback() {
  // finishPendingBankCallback is idempotent, so StrictMode's double
  // initializer call in development doesn't finish the consent twice.
  const [pending] = useState(() => finishPendingBankCallback());
  const [state, setState] = useState<State>(pending ? { kind: "working" } : { kind: "idle" });

  useEffect(() => {
    pending
      ?.then((result) => setState({ kind: "done", result }))
      .catch((err) => setState({ kind: "error", message: err instanceof Error ? err.message : String(err) }));
  }, [pending]);

  return (
    <>
      <PageHeader title="Revolut" />
      <div className="px-5 pb-8">
        <div className="flex flex-col items-center rounded-2xl bg-surface px-6 py-10 text-center">
          {state.kind === "working" && (
            <>
              <Loader2Icon className="h-9 w-9 animate-spin text-muted" aria-hidden="true" />
              <p className="mt-4 text-lg font-semibold">Connecting and importing your history…</p>
              <p className="mt-1 text-sm text-muted">This can take a minute the first time. Keep this page open.</p>
            </>
          )}
          {state.kind === "done" && (
            <>
              <CheckCircle2Icon className="h-10 w-10 text-positive" aria-hidden="true" />
              <p className="mt-4 text-lg font-semibold">
                Connected {state.result.accounts} account{state.result.accounts === 1 ? "" : "s"}
              </p>
              <p className="mt-1 text-sm text-muted">
                Imported {state.result.imported} transaction{state.result.imported === 1 ? "" : "s"}. They're being
                categorized now; the Dashboard fills in over the next few minutes.
              </p>
              <Link to="/" className={LINK}>
                Go to the Dashboard
              </Link>
            </>
          )}
          {state.kind === "error" && (
            <>
              <AlertTriangleIcon className="h-10 w-10 text-negative" aria-hidden="true" />
              <p className="mt-4 text-lg font-semibold">Couldn't connect</p>
              <p className="mt-1 text-sm text-muted">{state.message}</p>
              <Link to="/settings" className={LINK}>
                Back to Settings
              </Link>
            </>
          )}
          {state.kind === "idle" && (
            <>
              <p className="text-lg font-semibold">Nothing to finish here</p>
              <Link to="/settings" className={LINK}>
                Go to Settings
              </Link>
            </>
          )}
        </div>
      </div>
    </>
  );
}
