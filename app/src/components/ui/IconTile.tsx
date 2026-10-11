import type { LucideIcon } from "lucide-react";

/** A soft, colour-tinted tile that gives a row a quick visual identity. */
export function IconTile({
  icon: Icon,
  letter,
  color,
  round,
}: {
  icon?: LucideIcon;
  letter?: string;
  color: string;
  round?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-10 w-10 shrink-0 items-center justify-center text-sm font-bold ${round ? "rounded-full" : "rounded-xl"}`}
      style={{ backgroundColor: `${color}24`, color }}
    >
      {Icon ? <Icon className="h-[18px] w-[18px]" strokeWidth={2} /> : letter}
    </span>
  );
}
