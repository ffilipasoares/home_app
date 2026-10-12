/**
 * Chart colours. Categorical slots are the dataviz skill's validated dark
 * palette, in its fixed order (checked with validate_palette.js against the
 * card surface #151517: lightness, chroma, colour-blind separation and
 * contrast all pass). A category keeps its slot wherever it appears; the
 * slot comes from its position in Settings, never from its rank this month.
 */
import type { CategoryDef } from "../types";

export const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
/** "Other", last month and other context: the de-emphasis grey. */
export const MUTED = "#71717A";
/** The app accent, used only for emphasis (savings, this month). */
export const ACCENT = "#C8F169";
/** Card surface: the 2px gap between touching marks. */
export const SURFACE = "#151517";

/** Colour per spending category, by its order in Settings (salary and investments never appear in spending). */
export function categoryColors(categories: CategoryDef[]): (id: string) => string {
  const spending = categories.filter((c) => !c.special);
  return (id) => {
    const i = spending.findIndex((c) => c.id === id);
    return i >= 0 && i < SERIES.length ? SERIES[i] : MUTED;
  };
}

/** 12 345 -> "12,3K", for axis ticks and column caps. */
export function compactMoney(value: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(value);
}
