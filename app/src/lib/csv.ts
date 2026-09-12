import Papa from "papaparse";

export type RawRow = Record<string, string>;

export function parseBankCsv(file: File): Promise<RawRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<RawRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data),
      error: reject,
    });
  });
}

const DATE_HINTS = ["date", "data", "posting date", "value date"];
const DESCRIPTION_HINTS = ["description", "descricao", "descrição", "memo", "details", "narrative"];
const AMOUNT_HINTS = ["amount", "valor", "montante", "value"];
const DEBIT_HINTS = ["debit", "debito", "débito", "withdrawal"];
const CREDIT_HINTS = ["credit", "credito", "crédito", "deposit"];

function findColumn(headers: string[], hints: string[]): string | null {
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const hint of hints) {
    const idx = lower.findIndex((h) => h === hint || h.includes(hint));
    if (idx !== -1) return headers[idx];
  }
  return null;
}

export type ColumnGuess = {
  date: string | null;
  description: string | null;
  /** Set when the statement has a single signed amount column. */
  amount: string | null;
  /** Set instead of `amount` when the statement splits debit/credit into two columns. */
  debit: string | null;
  credit: string | null;
};

/** Best-effort column mapping so the Import screen can pre-fill its picker instead of starting blank. */
export function guessColumns(headers: string[]): ColumnGuess {
  return {
    date: findColumn(headers, DATE_HINTS),
    description: findColumn(headers, DESCRIPTION_HINTS),
    amount: findColumn(headers, AMOUNT_HINTS),
    debit: findColumn(headers, DEBIT_HINTS),
    credit: findColumn(headers, CREDIT_HINTS),
  };
}

/** Parses "1.234,56", "1,234.56" and "-42.50" alike into a plain float. */
export function parseAmount(raw: string): number {
  const trimmed = raw.trim().replace(/[^\d,.-]/g, "");
  const hasComma = trimmed.includes(",");
  const hasDot = trimmed.includes(".");
  let normalized = trimmed;
  if (hasComma && hasDot) {
    // Whichever separator appears last is the decimal point.
    normalized =
      trimmed.lastIndexOf(",") > trimmed.lastIndexOf(".")
        ? trimmed.replace(/\./g, "").replace(",", ".")
        : trimmed.replace(/,/g, "");
  } else if (hasComma) {
    normalized = trimmed.replace(",", ".");
  }
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : 0;
}

/** Normalizes DD/MM/YYYY, DD-MM-YYYY, and YYYY-MM-DD into YYYY-MM-DD. */
export function parseDate(raw: string): string {
  const trimmed = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(trimmed);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return trimmed;
}
