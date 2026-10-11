import { IconTile } from "./ui/IconTile";
import { categoryLook } from "../lib/categoryLook";
import type { CategoryDef } from "../types";

export function CategoryIcon({ category }: { category: CategoryDef | null | undefined }) {
  const { icon, color } = categoryLook(category);
  return <IconTile icon={icon} color={color} />;
}
