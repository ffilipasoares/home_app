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
    // Drop card/store/reference numbers (4+ digits, "LIDL 4521"), keep the
    // short ones that are part of a name ("TRADING 212", "7-ELEVEN").
    .replace(/[0-9]{4,}/g, " ")
    .replace(/[^A-Z0-9& ]+/g, " ") // drop punctuation
    .replace(/\s+/g, " ")
    .trim();
}
