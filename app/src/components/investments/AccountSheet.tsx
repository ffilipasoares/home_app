import { useState } from "react";
import { PlusIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { BottomSheet, SheetBody, SheetFooter } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import { AmountField, FieldError, FieldLabel } from "../ui/fields";
import { FIELD } from "../ui/styles";
import { parseAmount } from "../../lib/amount";
import { formatCurrency, formatMoney } from "../../lib/format";
import { connectTrading212, disconnectTrading212, lookupSymbol, type SymbolMatch } from "../../lib/investments";
import type { DisplayCurrency, InvestmentAccountSetting, InvestmentHolding, ValuedAccount, ValuedHolding } from "../../types";

type Props = {
  open: boolean;
  onClose: () => void;
  account: InvestmentAccountSetting | null;
  valued: ValuedAccount | undefined;
  currency: DisplayCurrency;
  /** Saves the edited account into the investment settings. */
  onSave: (account: InvestmentAccountSetting) => Promise<void>;
};

export function AccountSheet({ open, onClose, account, ...rest }: Props) {
  return (
    <BottomSheet open={open} onClose={onClose} title={account?.label ?? ""}>
      {account?.kind === "trading212" && <Trading212Form key={account.id} account={account} onClose={onClose} {...rest} />}
      {account?.kind === "cash" && <CashForm key={account.id} account={account} onClose={onClose} {...rest} />}
      {account?.kind === "holdings" && <HoldingsForm key={account.id} account={account} onClose={onClose} {...rest} />}
    </BottomSheet>
  );
}

type FormProps = Omit<Props, "open" | "account"> & { account: InvestmentAccountSetting };

function useRun(onClose: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function run(action: () => Promise<void>, close = true) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      if (close) onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^FirebaseError: /, "") : String(err));
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}

function HoldingList({ holdings, currency }: { holdings: ValuedHolding[]; currency: DisplayCurrency }) {
  if (holdings.length === 0) return <p className="text-[13px] text-muted">No shares in this account yet.</p>;
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl bg-raised">
      {holdings.map((h) => {
        const value = h.valueIn?.[currency];
        const invested = h.investedIn?.[currency];
        const gain = value !== undefined && invested !== undefined ? value - invested : undefined;
        return (
          <li key={h.symbol} className="flex items-center gap-3 px-3 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium">{h.name}</span>
              <span className="block truncate text-[13px] text-muted">
                {h.quantity.toLocaleString(undefined, { maximumFractionDigits: 6 })} ×{" "}
                {h.price !== null && (h.priceCurrency ?? h.currency)
                  ? formatCurrency(h.price, (h.priceCurrency ?? h.currency) as string)
                  : "no price"}
                {h.stale && " · last known price"}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-[15px] font-semibold tabular-nums">
                {value !== undefined ? formatMoney(value, currency) : "—"}
              </span>
              {gain !== undefined && (
                <span className={`block text-[12px] tabular-nums ${gain >= 0 ? "text-positive" : "text-negative"}`}>
                  {formatMoney(gain, currency, { signed: true })}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Connect with a read-only API key, or see what's in the account. */
function Trading212Form({ account, valued, currency, onClose }: FormProps) {
  const [key, setKey] = useState("");
  const [secret, setSecret] = useState("");
  const { busy, error, run } = useRun(onClose);
  const connected = !!valued?.connected;

  return (
    <>
      <SheetBody>
        {valued?.error && <p className="text-[13px] text-warning">{valued.error}</p>}
        {connected ? (
          <>
            <HoldingList holdings={valued?.holdings ?? []} currency={currency} />
            {valued?.cashIn?.[currency] !== undefined && (
              <p className="text-[13px] text-muted">
                Includes {formatMoney(valued.cashIn[currency] as number, currency)} of cash not invested yet.
              </p>
            )}
            <p className="text-[13px] text-muted">Read from Trading 212 at each sync (13:00 and 23:00) and when you refresh.</p>
          </>
        ) : (
          <>
            <ol className="list-decimal space-y-1 pl-5 text-[13px] text-muted">
              <li>In the Trading 212 app, switch to this account ({account.label}).</li>
              <li>Settings → API (Beta) → Generate API key.</li>
              <li>Allow only <span className="text-ink">Account data</span> and <span className="text-ink">Portfolio</span>, nothing that can trade.</li>
              <li>Copy the key and the secret here. They&apos;re kept on the server and never shown again.</li>
            </ol>
            <div>
              <FieldLabel htmlFor="t212-key">API key</FieldLabel>
              <input id="t212-key" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" className={`${FIELD} mt-2`} />
            </div>
            <div>
              <FieldLabel htmlFor="t212-secret">API secret</FieldLabel>
              <input
                id="t212-secret"
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                autoComplete="off"
                className={`${FIELD} mt-2`}
              />
            </div>
          </>
        )}
        {error && <FieldError>{error}</FieldError>}
      </SheetBody>
      <SheetFooter>
        {connected ? (
          <>
            <Button variant="danger" disabled={busy} onClick={() => run(() => disconnectTrading212(account.id))}>
              Disconnect
            </Button>
            <Button fullWidth onClick={onClose}>
              Done
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" fullWidth onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              fullWidth
              disabled={busy || !key.trim() || !secret.trim()}
              onClick={() => run(() => connectTrading212(account.id, key, secret))}
            >
              {busy ? "Checking…" : "Connect"}
            </Button>
          </>
        )}
      </SheetFooter>
    </>
  );
}

/** A balance you type in (the Cash ISA isn't covered by Trading 212's API). */
function CashForm({ account, onClose, onSave }: FormProps) {
  const currency = account.currency ?? "GBP";
  const [balance, setBalance] = useState(account.balance ? String(account.balance).replace(".", ",") : "");
  const { busy, error, run } = useRun(onClose);
  const value = parseAmount(balance);
  const invalid = value === undefined || (value !== null && value < 0);

  return (
    <>
      <SheetBody>
        <AmountField
          id="cash-balance"
          label="Balance"
          value={balance}
          onChange={setBalance}
          currency={currency}
          error={invalid ? "Enter an amount, e.g. 5000,00" : undefined}
          hint="Update it when you add money or interest is paid."
        />
        {error && <FieldError>{error}</FieldError>}
      </SheetBody>
      <SheetFooter>
        <Button variant="secondary" fullWidth onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button fullWidth disabled={busy || invalid} onClick={() => run(() => onSaveBalance())}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </SheetFooter>
    </>
  );

  function onSaveBalance() {
    return onSave({ ...account, balance: value ?? 0 });
  }
}

type Row = { id: string; symbol: string; name: string; quantity: string; invested: string };

const toText = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));

/** Shares you keep up to date by hand: change a quantity when you buy more. */
function HoldingsForm({ account, valued, currency, onClose, onSave }: FormProps) {
  const [rows, setRows] = useState<Row[]>(
    (account.holdings ?? []).map((h) => ({
      id: h.id,
      symbol: h.symbol,
      name: h.name ?? h.symbol,
      quantity: toText(h.quantity),
      invested: toText(h.invested),
    })),
  );
  const [adding, setAdding] = useState(false);
  const { busy, error, run } = useRun(onClose);
  const valuedBySymbol = new Map((valued?.holdings ?? []).map((h) => [h.symbol, h]));

  const parsed = rows.map((r) => ({ q: parseAmount(r.quantity), inv: parseAmount(r.invested) }));
  const invalid = parsed.some(({ q, inv }) => q === undefined || q === null || q < 0 || inv === undefined || (inv !== null && inv < 0));
  const update = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  function save() {
    const holdings: InvestmentHolding[] = rows.map((r, i) => ({
      id: r.id,
      symbol: r.symbol,
      name: r.name,
      quantity: parsed[i].q as number,
      invested: parsed[i].inv ?? null,
    }));
    return onSave({ ...account, holdings });
  }

  return (
    <>
      <SheetBody>
        {valued?.error && <p className="text-[13px] text-warning">Some prices couldn&apos;t be found: {valued.error}</p>}
        {rows.length === 0 && !adding && <p className="text-[13px] text-muted">No shares yet. Add the ones you hold here.</p>}
        {rows.map((r, i) => {
          const v = valuedBySymbol.get(r.symbol);
          const shareCurrency = v?.currency ?? "";
          return (
            <div key={r.id} className="rounded-xl bg-raised p-3">
              <div className="flex items-start gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{r.name}</span>
                  <span className="block text-[13px] text-muted">
                    {r.symbol}
                    {v?.price != null && v.currency && ` · ${formatCurrency(v.price, v.currency)} a share`}
                    {v?.valueIn?.[currency] !== undefined && ` · ${formatMoney(v.valueIn[currency] as number, currency)}`}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${r.name}`}
                  onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-selected hover:text-negative"
                >
                  <Trash2Icon className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div>
                  <FieldLabel htmlFor={`qty-${r.id}`}>Shares</FieldLabel>
                  <input
                    id={`qty-${r.id}`}
                    inputMode="decimal"
                    value={r.quantity}
                    placeholder="0"
                    onChange={(e) => update(r.id, { quantity: e.target.value })}
                    className={`${FIELD} mt-1.5 ${parsed[i].q === undefined ? "!border-negative" : ""}`}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor={`inv-${r.id}`}>Paid in total{shareCurrency ? ` (${shareCurrency})` : ""}</FieldLabel>
                  <input
                    id={`inv-${r.id}`}
                    inputMode="decimal"
                    value={r.invested}
                    placeholder="Optional"
                    onChange={(e) => update(r.id, { invested: e.target.value })}
                    className={`${FIELD} mt-1.5 ${parsed[i].inv === undefined ? "!border-negative" : ""}`}
                  />
                </div>
              </div>
            </div>
          );
        })}

        {adding ? (
          <AddHolding
            onPick={(m) => {
              setRows((rs) => [...rs, { id: `${m.symbol}-${Date.now()}`, symbol: m.symbol, name: m.name, quantity: "", invested: "" }]);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
            taken={new Set(rows.map((r) => r.symbol))}
          />
        ) : (
          <Button variant="secondary" fullWidth onClick={() => setAdding(true)}>
            <PlusIcon className="h-4 w-4" aria-hidden="true" />
            Add shares or a fund
          </Button>
        )}
        <p className="text-[13px] text-muted">
          Prices update at each sync. &ldquo;Paid in total&rdquo; is optional; with it you see the gain.
        </p>
        {error && <FieldError>{error}</FieldError>}
      </SheetBody>
      <SheetFooter>
        <Button variant="secondary" fullWidth onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button fullWidth disabled={busy || invalid} onClick={() => run(save)}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </SheetFooter>
    </>
  );
}

/** Finds a share or fund by name, ticker or ISIN. */
function AddHolding({ onPick, onCancel, taken }: { onPick: (m: SymbolMatch) => void; onCancel: () => void; taken: Set<string> }) {
  const [text, setText] = useState("");
  const [results, setResults] = useState<SymbolMatch[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function search() {
    setBusy(true);
    setError(undefined);
    try {
      setResults(await lookupSymbol(text.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-line p-3">
      <FieldLabel htmlFor="holding-search">Name, ticker or ISIN</FieldLabel>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim().length >= 2) search();
        }}
      >
        <input
          id="holding-search"
          value={text}
          placeholder="e.g. VWCE or IE00BK5BQT80"
          onChange={(e) => setText(e.target.value)}
          className={`${FIELD} min-w-0 flex-1`}
          autoFocus
        />
        <Button type="submit" disabled={busy || text.trim().length < 2} aria-label="Search">
          <SearchIcon className="h-4 w-4" aria-hidden="true" />
        </Button>
      </form>
      {busy && <p className="mt-2 text-[13px] text-muted">Searching…</p>}
      {error && <FieldError>{error}</FieldError>}
      {results && results.length === 0 && <p className="mt-2 text-[13px] text-muted">Nothing found. Try the ISIN from Degiro.</p>}
      {results && results.length > 0 && (
        <ul className="mt-2 divide-y divide-line overflow-hidden rounded-xl bg-raised">
          {results.map((m) => (
            <li key={m.symbol}>
              <button
                type="button"
                disabled={taken.has(m.symbol)}
                onClick={() => onPick(m)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-selected disabled:opacity-40"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{m.name}</span>
                  <span className="block truncate text-[13px] text-muted">
                    {m.symbol} · {m.exchange}
                  </span>
                </span>
                {m.price !== undefined && m.currency && (
                  <span className="shrink-0 text-[13px] tabular-nums text-muted">{formatCurrency(m.price, m.currency)}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={onCancel} className="mt-2 text-[13px] font-medium text-muted">
        Cancel
      </button>
    </div>
  );
}
