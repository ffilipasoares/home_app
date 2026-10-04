import { useEffect, useState } from "react";
import { startBankConnect, subscribeBankAccounts, syncBankNow } from "../lib/bank";
import type { AccountLink } from "../types";

function formatDate(ms: number, withTime = false) {
  return new Date(ms).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

function AccountRow({ account }: { account: AccountLink }) {
  const status =
    account.status === "reconnect-needed" ? (
      <span style={{ color: "var(--status-warning)" }}>Reconnect needed</span>
    ) : account.status === "disconnected" ? (
      <span style={{ color: "var(--text-muted)" }}>Not shared any more</span>
    ) : account.lastError ? (
      <span style={{ color: "var(--status-warning)" }}>Last sync failed, will retry tonight</span>
    ) : null;

  return (
    <div className="tx-row" style={{ alignItems: "flex-start" }}>
      <div className="tx-main" style={{ flex: 1, minWidth: 0 }}>
        <div className="tx-merchant">{account.displayName}</div>
        <div className="tx-date">
          {account.lastSyncedAt ? <>Synced {formatDate(account.lastSyncedAt, true)}</> : "Not synced yet"}
          {account.status !== "disconnected" && account.consentExpiresAt && (
            <> · access until {formatDate(account.consentExpiresAt)}</>
          )}
        </div>
        {status && <div style={{ fontSize: 13, marginTop: 2 }}>{status}</div>}
      </div>
    </div>
  );
}

/** Settings card: connect/reconnect Revolut, see linked accounts, sync on demand. */
export function BankConnectionCard({ uid }: { uid: string }) {
  const [accounts, setAccounts] = useState<AccountLink[]>([]);
  const [busy, setBusy] = useState<"connect" | "sync" | null>(null);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => subscribeBankAccounts(uid, setAccounts), [uid]);

  const linked = accounts.filter((a) => a.provider === "enablebanking").sort((a, b) => a.displayName.localeCompare(b.displayName));
  const hasActive = linked.some((a) => a.status === "active");

  async function handleConnect() {
    setBusy("connect");
    setNote(null);
    try {
      await startBankConnect(); // navigates away to Revolut on success
    } catch (err) {
      setNote({ text: err instanceof Error ? err.message : String(err), error: true });
      setBusy(null);
    }
  }

  async function handleSync() {
    setBusy("sync");
    setNote(null);
    try {
      const imported = await syncBankNow();
      setNote({ text: imported === 0 ? "Up to date, no new transactions." : `Imported ${imported} new transaction${imported === 1 ? "" : "s"}.` });
    } catch (err) {
      setNote({ text: err instanceof Error ? err.message : String(err), error: true });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card">
      <h2>Bank connection</h2>
      <p style={{ marginTop: 0, fontSize: 13, color: "var(--text-muted)" }}>
        Read-only access to the Revolut accounts you choose, through Enable Banking. New transactions, including
        pending card payments, are imported at 13:00 and 23:00; moves between your own accounts aren't counted.
      </p>

      {linked.map((account) => (
        <AccountRow key={account.id} account={account} />
      ))}

      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <button
          type="button"
          className={hasActive ? "button secondary" : "button"}
          disabled={busy !== null}
          onClick={handleConnect}
        >
          {busy === "connect" ? "Opening Revolut…" : hasActive ? "Reconnect Revolut" : "Connect Revolut"}
        </button>
        {hasActive && (
          <button type="button" className="button secondary" disabled={busy !== null} onClick={handleSync}>
            {busy === "sync" ? "Syncing…" : "Sync now"}
          </button>
        )}
      </div>
      {note && (
        <p style={{ fontSize: 13, marginBottom: 0, color: note.error ? "var(--status-critical)" : "var(--status-good)" }}>
          {note.text}
        </p>
      )}
      {!hasActive && (
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 0 }}>
          On iPhone, Revolut may send you back to Safari rather than the installed app; sign in there if asked and the
          connection finishes on its own.
        </p>
      )}
    </div>
  );
}
