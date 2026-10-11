import {
  ArrowDownLeftIcon,
  CircleDashedIcon,
  ClapperboardIcon,
  HeartPulseIcon,
  HomeIcon,
  PiggyBankIcon,
  PlaneIcon,
  RepeatIcon,
  ShoppingBagIcon,
  ShoppingBasketIcon,
  TagIcon,
  TrainFrontIcon,
  UtensilsCrossedIcon,
  WalletIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import type { CategoryDef } from "../types";

export type CategoryLook = { icon: LucideIcon; color: string };

const UNCATEGORIZED: CategoryLook = { icon: CircleDashedIcon, color: "#A1A1AA" };

// Categories are free text (Settings), so the look is picked from words in
// the id/name; anything unrecognised gets a tag in a colour of its own.
const BY_KEYWORD: [RegExp, CategoryLook][] = [
  [/groc|supermarket|market/, { icon: ShoppingBasketIcon, color: "#4ADE80" }],
  [/food|dining|restaurant|eat|takeaway|cafe/, { icon: UtensilsCrossedIcon, color: "#FB923C" }],
  [/travel|holiday|trip|flight/, { icon: PlaneIcon, color: "#2DD4BF" }],
  [/transport|car|fuel|uber|bolt|train|bus/, { icon: TrainFrontIcon, color: "#22D3EE" }],
  [/home|hous|rent|mortgage/, { icon: HomeIcon, color: "#60A5FA" }],
  [/need|bill|utilit|energy/, { icon: ZapIcon, color: "#FACC15" }],
  [/health|insur|gym|pharm|doctor/, { icon: HeartPulseIcon, color: "#F87171" }],
  [/shop|cloth/, { icon: ShoppingBagIcon, color: "#F472B6" }],
  [/subscr/, { icon: RepeatIcon, color: "#A78BFA" }],
  [/entertain|fun|leisure|cinema|going out/, { icon: ClapperboardIcon, color: "#E879F9" }],
  [/personal|pocket/, { icon: WalletIcon, color: "#E879F9" }],
  [/other|misc|uncategor/, UNCATEGORIZED],
];

const EXTRA_COLORS = ["#FDBA74", "#93C5FD", "#86EFAC", "#FCA5A5", "#C4B5FD", "#67E8F9"];

export function categoryLook(category: CategoryDef | null | undefined): CategoryLook {
  if (!category) return UNCATEGORIZED;
  if (category.special === "income") return { icon: ArrowDownLeftIcon, color: "#C8F169" };
  if (category.special === "savings") return { icon: PiggyBankIcon, color: "#818CF8" };
  const text = `${category.id} ${category.label}`.toLowerCase();
  const match = BY_KEYWORD.find(([pattern]) => pattern.test(text));
  if (match) return match[1];
  let hash = 0;
  for (const ch of category.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return { icon: TagIcon, color: EXTRA_COLORS[hash % EXTRA_COLORS.length] };
}
