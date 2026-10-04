import { formatCurrency } from "../lib/format";

export function StatTile({
  label,
  value,
  hero = false,
  currency = "EUR",
}: {
  label: string;
  value: number;
  hero?: boolean;
  currency?: string;
}) {
  return (
    <div className={`card stat-tile${hero ? " hero" : ""}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{formatCurrency(value, currency)}</div>
    </div>
  );
}
