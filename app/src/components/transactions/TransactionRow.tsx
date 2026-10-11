import { ArrowLeftRightIcon } from "lucide-react";
import { CategoryIcon } from "../CategoryIcon";
import { IconTile } from "../ui/IconTile";
import { amountShown } from "../../lib/transactionFilters";
import { formatCurrency, formatMoney } from "../../lib/format";
import { AI_SURE_THRESHOLD, categoryState } from "../../lib/transactionState";
import type { CategoryDef, DisplayCurrency, Transaction } from "../../types";

function Tag({ children, tone = "muted" }: { children: string; tone?: "muted" | "warning" }) {
  return (
    <span
      className={`shrink-0 rounded-md px-1.5 py-px text-[11px] font-medium ${
        tone === "warning" ? "bg-warning/15 text-warning" : "bg-raised text-muted"
      }`}
    >
      {children}
    </span>
  );
}

export function TransactionRow({
  tx,
  category,
  currency,
  onSelect,
}: {
  tx: Transaction;
  category: CategoryDef | undefined;
  currency: DisplayCurrency;
  onSelect: (tx: Transaction) => void;
}) {
  const shown = amountShown(tx, currency);
  const received = tx.amount > 0;
  const isInvestment = category?.special === "savings";
  const unsure =
    !!tx.category && tx.source === "auto" && tx.confidence !== undefined && tx.confidence < AI_SURE_THRESHOLD;
  const amountClass = tx.internalTransfer
    ? "text-subtle"
    : received
      ? "text-positive"
      : isInvestment
        ? "text-violet"
        : "text-ink";

  return (
    <button
      type="button"
      onClick={() => onSelect(tx)}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-raised focus-visible:bg-raised focus-visible:outline-none"
    >
      {tx.internalTransfer ? <IconTile icon={ArrowLeftRightIcon} color="#71717A" /> : <CategoryIcon category={category} />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-ink">{tx.merchantRaw}</span>
        <span className="mt-0.5 flex items-center gap-1.5 overflow-hidden text-[13px] text-muted">
          <span className="truncate">{categoryState(tx, category)}</span>
          {tx.needsReview && !!tx.category && !tx.internalTransfer && <Tag tone="warning">Confirm</Tag>}
          {unsure && <Tag tone="warning">AI not sure</Tag>}
          {tx.pending && <Tag>Pending</Tag>}
          {tx.addedManually && <Tag>Added by you</Tag>}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className={`block text-[15px] font-semibold tabular-nums ${amountClass}`}>
          {shown !== undefined ? formatMoney(shown, currency, { signed: true }) : formatMoney(tx.amount, tx.currency, { signed: true })}
        </span>
        {tx.currency !== currency && (
          <span className="block text-[11px] tabular-nums text-subtle">
            {shown !== undefined ? formatCurrency(Math.abs(tx.amount), tx.currency) : `${currency} pending`}
          </span>
        )}
      </span>
    </button>
  );
}
