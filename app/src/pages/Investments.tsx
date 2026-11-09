import { useEffect, useState } from "react";
import { BanknoteIcon, LineChartIcon, RefreshCwIcon } from "lucide-react";
import { useAuth } from "../lib/auth";
import { subscribeUserSettings } from "../lib/settings";
import {
  DEFAULT_INVESTMENT_ACCOUNTS,
  refreshInvestments,
  saveInvestmentSettings,
  subscribeInvestmentHistory,
  subscribeInvestments,
  subscribeInvestmentSettings,
} from "../lib/investments";
import { MUTED, SERIES } from "../lib/chartColors";
import { formatMoney } from "../lib/format";
import { formatSyncTime } from "../lib/month";
import { PageHeader } from "../components/ui/PageHeader";
import { IconTile } from "../components/ui/IconTile";
import { Notice, RowGroup, SectionHeader, ValueRow } from "../components/ui/ValueRow";
import { IncomeSplitBar } from "../components/analysis/IncomeSplitBar";
import { ValueLine } from "../components/investments/ValueLine";
import { AccountSheet } from "../components/investments/AccountSheet";
import { ENTRY_CURRENCY } from "../types";
import type {
  DisplayCurrency,
  InvestmentAccountSetting,
  InvestmentHistoryPoint,
  InvestmentSettings,
  InvestmentsDoc,
  UserSettings,
  ValuedAccount,
} from "../types";

/** What the account row says under its name. */
function describe(setting: InvestmentAccountSetting, valued: ValuedAccount | undefined, currency: DisplayCurrency): string {
  if (valued?.error && setting.kind === "trading212") return valued.error;
  if (setting.kind === "trading212") {
    if (!valued?.connected) return "Not connected · tap to connect";
    return `${valued.holdings.length} holding${valued.holdings.length === 1 ? "" : "s"} · synced`;
  }
  if (setting.kind === "cash") return "Balance you enter";
  const n = setting.holdings?.length ?? 0;
  const gain = valued?.gainIn?.[currency];
  const base = n === 0 ? "No shares yet · tap to add" : `${n} holding${n === 1 ? "" : "s"}`;
  return gain !== undefined ? `${base} · ${formatMoney(gain, currency, { signed: true })}` : base;
}

/**
 * Everything invested, across Trading 212 (Stocks ISA through its API, the
 * Cash ISA as a balance you enter), Degiro and Google stock at Schwab
 * (shares you keep up to date): the total and gain, how it splits across
 * accounts, the total day by day, and each account.
 */
export function Investments() {
  const { user } = useAuth();
  const uid = user!.uid;
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [accounts, setAccounts] = useState<InvestmentSettings | null | undefined>(undefined);
  const [current, setCurrent] = useState<InvestmentsDoc | null>(null);
  const [history, setHistory] = useState<InvestmentHistoryPoint[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string>();

  useEffect(() => subscribeUserSettings(uid, setSettings), [uid]);
  useEffect(() => subscribeInvestmentSettings(uid, setAccounts), [uid]);
  useEffect(() => subscribeInvestments(uid, setCurrent), [uid]);
  useEffect(() => subscribeInvestmentHistory(uid, setHistory), [uid]);
  // First visit: set up the accounts (decided by the user).
  useEffect(() => {
    if (accounts === null) saveInvestmentSettings(uid, DEFAULT_INVESTMENT_ACCOUNTS);
  }, [accounts, uid]);

  const currency: DisplayCurrency = settings?.displayCurrency ?? ENTRY_CURRENCY;
  const list = accounts?.accounts ?? [];
  const valuedById = new Map((current?.accounts ?? []).map((a) => [a.id, a]));
  // An account keeps its colour by its place in the list, whatever its size.
  const colorOf = (id: string) => {
    const i = list.findIndex((a) => a.id === id);
    return i >= 0 && i < SERIES.length ? SERIES[i] : MUTED;
  };
  const total = current?.totalIn?.[currency] ?? 0;
  const gain = current?.gainIn?.[currency];
  const parts = list.map((a) => ({
    id: a.id,
    label: a.label,
    amount: valuedById.get(a.id)?.valueIn?.[currency] ?? 0,
    color: colorOf(a.id),
  }));
  const points = history
    .filter((p) => p.totalIn?.[currency] !== undefined)
    .map((p) => ({ date: p.date, value: p.totalIn[currency] as number }));
  const open = list.find((a) => a.id === openId) ?? null;

  async function refresh() {
    setRefreshing(true);
    setRefreshError(undefined);
    try {
      await refreshInvestments();
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  }

  async function saveAccount(updated: InvestmentAccountSetting) {
    await saveInvestmentSettings(uid, { accounts: list.map((a) => (a.id === updated.id ? updated : a)) });
  }

  return (
    <>
      <PageHeader
        title="Investments"
        action={
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            aria-label="Refresh prices and balances"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-muted transition-colors hover:text-ink disabled:opacity-50"
          >
            <RefreshCwIcon className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
          </button>
        }
      />

      <div className="space-y-10 px-5 pb-8">
        <section aria-label="Total value" className="rounded-3xl bg-surface p-5">
          <p className="text-sm font-medium text-muted">Total value</p>
          <p className="mt-1 text-[40px] font-bold leading-tight tracking-tight tabular-nums">{formatMoney(total, currency)}</p>
          {gain !== undefined && (
            <p className="mt-1 text-[15px]">
              <span className={`font-semibold tabular-nums ${gain >= 0 ? "text-positive" : "text-negative"}`}>
                {formatMoney(gain, currency, { signed: true })}
              </span>{" "}
              <span className="text-muted">{gain >= 0 ? "gain" : "loss"} on what you put in, where known</span>
            </p>
          )}
          <p className="mt-3 text-[12px] text-subtle">
            {current ? `Updated ${formatSyncTime(current.updatedAt)}` : "Not valued yet"}
            {refreshError && <span className="text-warning"> · {refreshError}</span>}
          </p>
        </section>

        {total > 0 && (
          <section aria-labelledby="split-heading">
            <SectionHeader id="split-heading" title="Where it is" note="Share of the total in each account." />
            <div className="mt-4 rounded-2xl bg-surface p-4">
              <IncomeSplitBar parts={parts} base={total} currency={currency} />
            </div>
          </section>
        )}

        <section aria-labelledby="value-heading">
          <SectionHeader id="value-heading" title="Total value over time" note="One point a day, from each day's last refresh." />
          <div className="mt-4 rounded-2xl bg-surface p-4">
            {points.length >= 2 ? (
              <ValueLine points={points} currency={currency} />
            ) : (
              <p className="py-6 text-center text-sm text-muted">The chart fills in from today, one point a day.</p>
            )}
          </div>
        </section>

        <section aria-labelledby="accounts-heading">
          <SectionHeader id="accounts-heading" title="Accounts" />
          <RowGroup className="mt-3">
            {list.map((a) => {
              const valued = valuedById.get(a.id);
              const value = valued?.valueIn?.[currency];
              return (
                <ValueRow
                  key={a.id}
                  leading={
                    <IconTile icon={a.kind === "cash" ? BanknoteIcon : LineChartIcon} color={colorOf(a.id)} />
                  }
                  label={a.label}
                  description={describe(a, valued, currency)}
                  value={value !== undefined ? formatMoney(value, currency) : "—"}
                  onClick={() => setOpenId(a.id)}
                />
              );
            })}
          </RowGroup>
          {list.some((a) => valuedById.get(a.id)?.stale) && (
            <div className="mt-3">
              <Notice>Some values couldn&apos;t be refreshed this time; the last known ones are shown.</Notice>
            </div>
          )}
        </section>

        <p className="text-[12px] text-subtle">
          Not counted in spending or money left. Money you move to investments still shows on the Dashboard as
          invested that month.
        </p>
      </div>

      <AccountSheet
        open={open !== null}
        onClose={() => setOpenId(null)}
        account={open}
        valued={open ? valuedById.get(open.id) : undefined}
        currency={currency}
        onSave={saveAccount}
      />
    </>
  );
}
