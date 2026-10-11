import { useMemo, useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2Icon, FileTextIcon, Loader2Icon, UploadIcon } from "lucide-react";
import { useAuth } from "../lib/auth";
import { guessColumns, parseAmount, parseBankCsv, parseDate, type RawRow } from "../lib/csv";
import { importTransactions, type ImportRow } from "../lib/transactions";
import { formatMoney } from "../lib/format";
import { formatShortDate } from "../lib/month";
import { PageHeader } from "../components/ui/PageHeader";
import { Button } from "../components/ui/Button";
import { FieldLabel } from "../components/ui/fields";
import { FIELD } from "../components/ui/styles";
import { SegmentedControl } from "../components/ui/SegmentedControl";

type Mode = "signed" | "debit-credit";
type Stage =
  | { status: "idle"; error?: string }
  | { status: "reading"; fileName: string }
  | { status: "mapping"; fileName: string }
  | { status: "importing"; fileName: string }
  | { status: "done"; count: number };

function ColumnSelect({
  id,
  label,
  value,
  onChange,
  headers,
  optional,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  headers: string[];
  optional?: boolean;
}) {
  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={`${FIELD} mt-2`}>
        {optional && <option value="">—</option>}
        {headers.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Adds transactions from a bank that isn't connected, from its CSV
 * statement. Columns are guessed and can be corrected; each row's id comes
 * from its own content, so importing the same file twice adds nothing new.
 */
export function Import() {
  const { user } = useAuth();
  const uid = user!.uid;
  const [stage, setStage] = useState<Stage>({ status: "idle" });
  const [dragging, setDragging] = useState(false);
  const [rows, setRows] = useState<RawRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [dateCol, setDateCol] = useState("");
  const [descCol, setDescCol] = useState("");
  const [mode, setMode] = useState<Mode>("signed");
  const [amountCol, setAmountCol] = useState("");
  const [debitCol, setDebitCol] = useState("");
  const [creditCol, setCreditCol] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [importError, setImportError] = useState<string>();

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setStage({ status: "idle", error: "That file isn't a CSV. Export your statement as .csv and try again." });
      return;
    }
    setStage({ status: "reading", fileName: file.name });
    try {
      const parsed = await parseBankCsv(file);
      if (parsed.length === 0) {
        setStage({ status: "idle", error: "That file has no rows that could be read." });
        return;
      }
      const cols = Object.keys(parsed[0]);
      const guess = guessColumns(cols);
      setHeaders(cols);
      setRows(parsed);
      setDateCol(guess.date ?? cols[0]);
      setDescCol(guess.description ?? cols[1] ?? cols[0]);
      if (guess.amount) {
        setMode("signed");
        setAmountCol(guess.amount);
      } else if (guess.debit || guess.credit) {
        setMode("debit-credit");
        setDebitCol(guess.debit ?? "");
        setCreditCol(guess.credit ?? "");
      } else {
        setMode("signed");
        setAmountCol(cols[cols.length - 1]);
      }
      setImportError(undefined);
      setStage({ status: "mapping", fileName: file.name });
    } catch (err) {
      setStage({ status: "idle", error: `Couldn't read that file: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  const mappedRows: ImportRow[] = useMemo(() => {
    if (!dateCol || !descCol) return [];
    return rows
      .map((row) => {
        const date = parseDate(row[dateCol] ?? "");
        const merchantRaw = (row[descCol] ?? "").trim();
        let amount: number;
        if (mode === "signed") {
          amount = parseAmount(row[amountCol] ?? "0");
        } else {
          const debit = parseAmount(row[debitCol] || "0");
          const credit = parseAmount(row[creditCol] || "0");
          amount = credit - Math.abs(debit);
        }
        return { date, amount, merchantRaw, currency };
      })
      .filter((r) => r.date && r.merchantRaw);
  }, [rows, dateCol, descCol, mode, amountCol, debitCol, creditCol, currency]);

  async function handleImport() {
    if (stage.status !== "mapping") return;
    setStage({ status: "importing", fileName: stage.fileName });
    setImportError(undefined);
    try {
      const count = await importTransactions(uid, mappedRows);
      setRows([]);
      setHeaders([]);
      setStage({ status: "done", count });
    } catch (err) {
      console.error(err);
      setImportError(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
      setStage({ status: "mapping", fileName: stage.fileName });
    }
  }

  const reset = () => {
    setRows([]);
    setHeaders([]);
    setStage({ status: "idle" });
  };

  return (
    <>
      <PageHeader title="Import" />
      <div className="px-5 pb-8">
        <p className="text-[15px] text-muted">Add transactions from a bank that isn't connected. Revolut syncs on its own.</p>

        {stage.status === "done" ? (
          <div className="mt-6 flex flex-col items-center rounded-2xl bg-surface px-6 py-10 text-center">
            <CheckCircle2Icon className="h-10 w-10 text-positive" aria-hidden="true" />
            <p className="mt-4 text-lg font-semibold">
              Imported {stage.count} transaction{stage.count === 1 ? "" : "s"}
            </p>
            <p className="mt-1 text-sm text-muted">
              The AI categorizes them now and they count on the Dashboard. Importing the same file again adds nothing new.
            </p>
            <div className="mt-6 flex w-full gap-3">
              <Button variant="secondary" fullWidth onClick={reset}>
                Import another
              </Button>
              <Link
                to="/transactions"
                className="inline-flex h-12 flex-1 items-center justify-center rounded-xl bg-accent text-[15px] font-semibold text-canvas transition-colors hover:bg-accent-hover"
              >
                View
              </Link>
            </div>
          </div>
        ) : stage.status === "mapping" || stage.status === "importing" ? (
          <div className="mt-6 space-y-6">
            <div className="flex items-center gap-3 rounded-2xl bg-surface p-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-raised text-muted" aria-hidden="true">
                <FileTextIcon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">{stage.fileName}</span>
                <span className="block text-[13px] text-muted">
                  {mappedRows.length} transaction{mappedRows.length === 1 ? "" : "s"} found
                </span>
              </span>
              <button type="button" onClick={reset} className="text-sm font-medium text-muted hover:text-ink">
                Change
              </button>
            </div>

            <section aria-labelledby="map-heading" className="space-y-4">
              <h2 id="map-heading" className="text-base font-semibold">
                Columns
              </h2>
              <ColumnSelect id="col-date" label="Date" value={dateCol} onChange={setDateCol} headers={headers} />
              <ColumnSelect id="col-desc" label="Description" value={descCol} onChange={setDescCol} headers={headers} />
              <div>
                <p className="text-sm font-medium text-muted">Amount format</p>
                <div className="mt-2">
                  <SegmentedControl<Mode>
                    label="Amount format"
                    value={mode}
                    onChange={setMode}
                    options={[
                      { value: "signed", label: "One column (±)" },
                      { value: "debit-credit", label: "Debit / credit" },
                    ]}
                  />
                </div>
              </div>
              {mode === "signed" ? (
                <ColumnSelect id="col-amount" label="Amount" value={amountCol} onChange={setAmountCol} headers={headers} />
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <ColumnSelect id="col-debit" label="Money out" value={debitCol} onChange={setDebitCol} headers={headers} optional />
                  <ColumnSelect id="col-credit" label="Money in" value={creditCol} onChange={setCreditCol} headers={headers} optional />
                </div>
              )}
              <div>
                <FieldLabel htmlFor="csv-currency">Currency</FieldLabel>
                <input
                  id="csv-currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  maxLength={3}
                  className={`${FIELD} mt-2 uppercase`}
                />
              </div>
            </section>

            {mappedRows.length > 0 && (
              <section aria-labelledby="preview-heading">
                <h2 id="preview-heading" className="text-base font-semibold">
                  Preview
                </h2>
                <ul className="mt-3 divide-y divide-line rounded-2xl bg-surface">
                  {mappedRows.slice(0, 8).map((r, i) => (
                    <li key={i} className="flex items-center gap-3 px-4 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium">{r.merchantRaw}</span>
                        <span className="block text-[13px] text-muted">{formatShortDate(r.date)}</span>
                      </span>
                      <span className={`shrink-0 text-[15px] font-semibold tabular-nums ${r.amount > 0 ? "text-positive" : ""}`}>
                        {/^[A-Z]{3}$/.test(r.currency)
                          ? formatMoney(r.amount, r.currency, { signed: true })
                          : r.amount.toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
                {mappedRows.length > 8 && (
                  <p className="mt-2 text-center text-[13px] text-subtle">and {mappedRows.length - 8} more</p>
                )}
              </section>
            )}

            {importError && (
              <p role="alert" className="text-sm text-negative">
                {importError}
              </p>
            )}
            <Button
              className="w-full"
              disabled={mappedRows.length === 0 || stage.status === "importing"}
              onClick={handleImport}
            >
              {stage.status === "importing" && <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {stage.status === "importing"
                ? "Importing…"
                : `Import ${mappedRows.length} transaction${mappedRows.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        ) : (
          <>
            <label
              htmlFor="csv-file"
              onDragOver={(e: DragEvent<HTMLLabelElement>) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e: DragEvent<HTMLLabelElement>) => {
                e.preventDefault();
                setDragging(false);
                handleFile(e.dataTransfer.files[0]);
              }}
              className={`mt-6 flex cursor-pointer flex-col items-center rounded-2xl border border-dashed px-6 py-12 text-center transition-colors duration-150 focus-within:ring-2 focus-within:ring-accent ${
                dragging ? "border-accent bg-raised" : "border-line bg-surface hover:bg-raised"
              }`}
            >
              {stage.status === "reading" ? (
                <>
                  <Loader2Icon className="h-7 w-7 animate-spin text-muted" aria-hidden="true" />
                  <span className="mt-4 text-[15px] font-medium">Reading {stage.fileName}…</span>
                </>
              ) : (
                <>
                  <UploadIcon className="h-7 w-7 text-muted" aria-hidden="true" />
                  <span className="mt-4 text-[15px] font-semibold">Choose a CSV statement</span>
                  <span className="mt-1 text-sm text-muted">or drop it here</span>
                </>
              )}
              <input
                id="csv-file"
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                disabled={stage.status === "reading"}
                onChange={(e) => {
                  handleFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            {stage.status === "idle" && stage.error && (
              <p role="alert" className="mt-3 text-sm text-negative">
                {stage.error}
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}
