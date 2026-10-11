/**
 * Amounts typed by hand. `<input type="number">` can't be trusted with a
 * decimal comma: Chrome drops it ("1833,38" becomes 183338) and Safari
 * reports the box as empty. So amount boxes are text boxes parsed here,
 * accepting either separator.
 */

/**
 * "1833,38", "1833.38", "1 833,38", "1.833,38" and "1,833.38" all read as
 * 1833.38. Returns null for an empty box and undefined for something that
 * isn't an amount.
 */
export function parseAmount(raw: string): number | null | undefined {
  let s = raw.replace(/[\s  £€]/g, "");
  if (s === "") return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma !== -1 && lastDot !== -1) {
    // Both present: the last one is the decimal separator, the other groups thousands.
    const decimal = lastComma > lastDot ? "," : ".";
    const group = decimal === "," ? "." : ",";
    s = s.split(group).join("").replace(decimal, ".");
  } else if (lastComma !== -1) {
    // Only commas: one followed by exactly three digits more than once is
    // grouping ("1,833,000"); otherwise it's the decimal comma.
    s = /^-?\d{1,3}(,\d{3}){2,}$/.test(s) ? s.split(",").join("") : s.replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3}){2,}$/.test(s)) {
    s = s.split(".").join(""); // "1.833.000"
  }
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return undefined;
  return Number(s);
}

/** How a stored amount is shown in a box, with this device's decimal separator. */
export function formatAmountInput(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return value.toLocaleString(undefined, { useGrouping: false, maximumFractionDigits: 2 });
}
