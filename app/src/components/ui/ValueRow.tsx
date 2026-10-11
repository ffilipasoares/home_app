import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRightIcon } from "lucide-react";

const ROW =
  "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-150 hover:bg-raised focus-visible:bg-raised focus-visible:outline-none";

/** A tappable row: optional icon, label and description on the left, a value and a chevron on the right. */
export function ValueRow({
  label,
  description,
  value,
  leading,
  onClick,
  to,
}: {
  label: string;
  description?: ReactNode;
  value?: ReactNode;
  leading?: ReactNode;
  onClick?: () => void;
  to?: string;
}) {
  const content = (
    <>
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-ink">{label}</span>
        {description && <span className="mt-0.5 block truncate text-[13px] text-muted">{description}</span>}
      </span>
      {value !== undefined && <span className="shrink-0 text-[15px] font-medium tabular-nums text-ink">{value}</span>}
      <ChevronRightIcon className="h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />
    </>
  );
  if (to) {
    return (
      <Link to={to} className={ROW}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={ROW}>
      {content}
    </button>
  );
}

/** A rounded group of rows with dividers. */
export function RowGroup({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`divide-y divide-line overflow-hidden rounded-2xl bg-surface ${className}`}>{children}</div>;
}

/** Section title, with an optional value or link on the right and a short note under it. */
export function SectionHeader({
  id,
  title,
  aside,
  note,
}: {
  id: string;
  title: string;
  aside?: ReactNode;
  note?: ReactNode;
}) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="text-base font-semibold">
          {title}
        </h2>
        {aside}
      </div>
      {note && <p className="mt-0.5 text-[13px] text-muted">{note}</p>}
    </>
  );
}

/** A quiet notice line inside a rounded box (warnings, empty states). */
export function Notice({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "warning";
}) {
  return (
    <div
      className={`rounded-2xl px-4 py-3 text-sm ${
        tone === "warning" ? "border border-warning/30 bg-warning/10 text-ink" : "bg-surface text-muted"
      }`}
    >
      {children}
    </div>
  );
}
