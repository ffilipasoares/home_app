import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { finishPendingBankCallback, type FinishResult } from "../lib/bank";

type State = { kind: "working" } | { kind: "done"; result: FinishResult } | { kind: "error"; message: string } | { kind: "idle" };

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
    <div className="screen">
      <h1>Revolut</h1>
      <div className="card">
        {state.kind === "working" && (
          <>
            <p style={{ marginTop: 0 }}>Connecting and importing your transaction history…</p>
            <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 0 }}>
              This can take a minute the first time. Keep this page open.
            </p>
          </>
        )}
        {state.kind === "done" && (
          <>
            <p style={{ marginTop: 0 }}>
              Connected {state.result.accounts} account{state.result.accounts === 1 ? "" : "s"} and imported{" "}
              {state.result.imported} transaction{state.result.imported === 1 ? "" : "s"}.
            </p>
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
              They're being categorized now; the dashboard fills in over the next few minutes.
            </p>
            <Link to="/">Go to the dashboard →</Link>
          </>
        )}
        {state.kind === "error" && (
          <>
            <p style={{ marginTop: 0, color: "var(--status-critical)" }}>Couldn't connect: {state.message}</p>
            <Link to="/settings">Back to Settings</Link>
          </>
        )}
        {state.kind === "idle" && (
          <>
            <p style={{ marginTop: 0 }}>Nothing to finish here.</p>
            <Link to="/settings">Go to Settings</Link>
          </>
        )}
      </div>
    </div>
  );
}
