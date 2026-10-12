import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDownIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "../ui/Button";
import { SectionHeader } from "../ui/ValueRow";
import { MANUAL_SYNCS_PER_DAY, lisbonToday, startBankConnect, subscribeBankAccounts, syncBankNow } from "../../lib/bank";
import { subscribeUserSettings } from "../../lib/settings";
import { formatShortDate, formatSyncTime } from "../../lib/month";
import type { AccountLink, UserSettings } from "../../types";

function statusOf(account: AccountLink, syncing: boolean): { dot: string; text: string; tone?: string } {
  if (account.status === "reconnect-needed") return { dot: "bg-warning", text: "Reconnect needed", tone: "text-warning" };
  if (account.status === "disconnected") return { dot: "bg-subtle", text: "Not shared any more" };
  if (syncing) return { dot: "animate-pulse bg-violet", text: "Syncing…" };
  const synced = account.lastSyncedAt ? `Synced ${formatSyncTime(account.lastSyncedAt)}` : "Not synced yet";
  if (account.lastError) return { dot: "bg-warning", text: `${synced} · last sync failed, retries at the next one`, tone: "text-warning" };
  return { dot: "bg-positive", text: synced };
}

/** Connect/reconnect Revolut, see the linked accounts, sync on demand. */
export function BankConnection({ uid }: { uid: string }) {
  const [accounts, setAccounts] = useState<AccountLink[]>([]);
  const [busy, setBusy] = useState<"connect" | "sync" | null>(null);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => subscribeBankAccounts(uid, setAccounts), [uid]);
  const [manualSyncs, setManualSyncs] = useState<UserSettings["manualSyncs"]>();
  useEffect(() => subscribeUserSettings(uid, (s) => setManualSyncs(s.manualSyncs)), [uid]);
  const limit = manualSyncs?.limit ?? MANUAL_SYNCS_PER_DAY;
  const syncsLeft = manualSyncs?.date === lisbonToday() ? Math.max(0, limit - manualSyncs.count) : limit;

  const linked = accounts
    .filter((a) => a.provider === "enablebanking")
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
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
      const { imported } = await syncBankNow();
      setNote({
        text: imported === 0 ? "Up to date, no new transactions." : `Imported ${imported} new transaction${imported === 1 ? "" : "s"}.`,
      });
    } catch (err) {
      setNote({ text: err instanceof Error ? err.message : String(err), error: true });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="bank-heading">
      <SectionHeader id="bank-heading" title="Bank connection" note="Revolut, read-only via Enable Banking. Syncs at 13:00 and 23:00." />

      {linked.length > 0 && (
        <ul className="mt-3 divide-y divide-line rounded-2xl bg-surface">
          {linked.map((a) => {
            const status = statusOf(a, busy === "sync" && a.status === "active");
            return (
              <li key={a.id} className="flex items-center gap-3 px-4 py-3.5">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${status.dot}`} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium">{a.displayName}</span>
                  <span className={`block text-[13px] ${status.tone ?? "text-muted"}`} aria-live="polite">
                    {status.text}
                  </span>
                </span>
                {a.status !== "disconnected" && a.consentExpiresAt && (
                  <span className="shrink-0 text-right text-[12px] leading-tight text-subtle">
                    Access until
                    <br />
                    {formatShortDate(a.consentExpiresAt)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex gap-3">
        {hasActive && (
          <Button variant="secondary" fullWidth onClick={handleSync} disabled={busy !== null || syncsLeft === 0} className="h-11">
            <RefreshCwIcon className={`h-4 w-4 ${busy === "sync" ? "animate-spin" : ""}`} aria-hidden="true" />
            {busy === "sync" ? "Syncing" : "Sync now"}
          </Button>
        )}
        <Button
          variant={hasActive ? "secondary" : "primary"}
          fullWidth
          onClick={handleConnect}
          disabled={busy !== null}
          className="h-11"
        >
          {busy === "connect" ? "Opening Revolut…" : hasActive ? "Reconnect" : "Connect Revolut"}
        </Button>
      </div>
      {hasActive && (
        <p className="mt-2 text-[13px] text-muted">
          {syncsLeft === 0
            ? "No extra syncs left today; the automatic ones still run at 13:00 and 23:00."
            : `${syncsLeft} of ${limit} extra syncs left today.`}
        </p>
      )}
      {note && (
        <p role="status" className={`mt-3 text-sm ${note.error ? "text-negative" : "text-positive"}`}>
          {note.text}
        </p>
      )}

      <button
        type="button"
        onClick={() => setShowDetails((v) => !v)}
        aria-expanded={showDetails}
        className="mt-3 flex items-center gap-1 text-sm font-medium text-muted hover:text-ink"
      >
        How syncing works
        <ChevronDownIcon className={`h-4 w-4 transition-transform duration-200 ${showDetails ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      <AnimatePresence initial={false}>
        {showDetails && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="mt-2 space-y-2 text-sm leading-relaxed text-muted"
          >
            <p>
              New transactions, including pending card payments, are imported at 13:00 and 23:00. Moves between your own
              accounts aren't counted as spending or income.
            </p>
            <p>
              Open banking allows about 4 reads of an account a day, and the automatic syncs use 2, so Sync now works up to{" "}
              {limit} times a day (counted per day in Lisbon).
            </p>
            {!hasActive && (
              <p>
                On iPhone, Revolut may send you back to Safari rather than the installed app; sign in there if asked and
                the connection finishes on its own.
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
