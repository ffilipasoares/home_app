import { useMemo, useState } from "react";
import { useAuth } from "../lib/auth";
import { guessColumns, parseAmount, parseBankCsv, parseDate, type RawRow } from "../lib/csv";
import { importTransactions, type ImportRow } from "../lib/transactions";
import { formatCurrency } from "../lib/format";

type Mode = "signed" | "debit-credit";

export function Import() {
  const { user } = useAuth();
  const uid = user!.uid;

  const [rows, setRows] = useState<RawRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [dateCol, setDateCol] = useState("");
  const [descCol, setDescCol] = useState("");
  const [mode, setMode] = useState<Mode>("signed");
  const [amountCol, setAmountCol] = useState("");
  const [debitCol, setDebitCol] = useState("");
  const [creditCol, setCreditCol] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    setStatus(null);
    const parsed = await parseBankCsv(file);
    if (parsed.length === 0) {
      setStatus("That file has no rows Papa Parse could read.");
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
    setBusy(true);
    setStatus(null);
    try {
      const count = await importTransactions(uid, mappedRows);
      setStatus(`Imported ${count} transaction${count === 1 ? "" : "s"}. Re-importing the same file is safe — duplicates are skipped.`);
      setRows([]);
      setHeaders([]);
    } catch (err) {
      console.error(err);
      setStatus("Import failed — see the browser console for details.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <h1>Import statement</h1>
      <div className="card">
        <p style={{ marginTop: 0, color: "var(--text-secondary)", fontSize: 13 }}>
          Export a CSV from your bank and upload it here. Rows land as uncategorized
          transactions flagged "needs review" — assign categories on the Transactions
          screen afterwards.
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
      </div>

      {headers.length > 0 && (
        <div className="card">
          <h2>Map columns</h2>
          <div className="field">
            <label>Date column</label>
            <select value={dateCol} onChange={(e) => setDateCol(e.target.value)}>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Description column</label>
            <select value={descCol} onChange={(e) => setDescCol(e.target.value)}>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Amount format</label>
            <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
              <option value="signed">Single signed amount column</option>
              <option value="debit-credit">Separate debit/credit columns</option>
            </select>
          </div>
          {mode === "signed" ? (
            <div className="field">
              <label>Amount column</label>
              <select value={amountCol} onChange={(e) => setAmountCol(e.target.value)}>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <div className="field">
                <label>Debit (money out) column</label>
                <select value={debitCol} onChange={(e) => setDebitCol(e.target.value)}>
                  <option value="">—</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Credit (money in) column</label>
                <select value={creditCol} onChange={(e) => setCreditCol(e.target.value)}>
                  <option value="">—</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
          <div className="field">
            <label>Currency</label>
            <input type="text" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
          </div>
        </div>
      )}

      {mappedRows.length > 0 && (
        <div className="card">
          <h2>Preview ({mappedRows.length} rows)</h2>
          <div className="table-scroll">
            <table className="import-preview">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {mappedRows.slice(0, 8).map((r, i) => (
                  <tr key={i}>
                    <td>{r.date}</td>
                    <td>{r.merchantRaw}</td>
                    <td>{formatCurrency(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="button" style={{ marginTop: 12 }} disabled={busy} onClick={handleImport}>
            {busy ? "Importing…" : `Import ${mappedRows.length} transactions`}
          </button>
        </div>
      )}

      {status && (
        <div className="card">
          <p style={{ margin: 0 }}>{status}</p>
        </div>
      )}
    </div>
  );
}
