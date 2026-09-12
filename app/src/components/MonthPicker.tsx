import { currentMonth } from "../lib/month";

export function MonthPicker({
  month,
  availableMonths,
  onChange,
}: {
  month: string;
  availableMonths: string[];
  onChange: (month: string) => void;
}) {
  // Always include the current month, even before any dashboard doc exists for it.
  const options = Array.from(new Set([currentMonth(), month, ...availableMonths])).sort().reverse();
  return (
    <select value={month} onChange={(e) => onChange(e.target.value)} aria-label="Month">
      {options.map((m) => (
        <option key={m} value={m}>
          {m}
        </option>
      ))}
    </select>
  );
}
