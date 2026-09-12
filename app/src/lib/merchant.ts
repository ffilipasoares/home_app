/**
 * Normalizes a raw statement description into a stable key so the same
 * merchant (e.g. "LIDL LISBOA 4521", "LIDL LISBOA 0918") groups together for
 * category learning. Deliberately simple/deterministic — this is the same
 * normalization the daily categorization agent will use in Phase 2, so a
 * category you set manually now keeps matching later.
 */
export function normalizeMerchant(raw: string): string {
  return raw
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents (Descrição -> DESCRICAO)
    .replace(/\d+/g, " ") // drop card/store/reference numbers
    .replace(/[^A-Z& ]+/g, " ") // drop punctuation
    .replace(/\s+/g, " ")
    .trim();
}
