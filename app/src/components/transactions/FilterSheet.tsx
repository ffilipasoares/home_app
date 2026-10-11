import { BottomSheet, SheetBody, SheetFooter } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import { ChipPicker, Toggle } from "../ui/fields";
import { SegmentedControl } from "../ui/SegmentedControl";
import type { Filters } from "../../lib/transactionFilters";
import type { CategoryDef } from "../../types";

export function FilterSheet({
  open,
  onClose,
  filters,
  onChange,
  onReset,
  resultCount,
  categories,
  sourceOptions,
}: {
  open: boolean;
  onClose: () => void;
  filters: Filters;
  onChange: (filters: Filters) => void;
  onReset: () => void;
  resultCount: number;
  categories: CategoryDef[];
  /** The accounts/sources that actually appear, e.g. Revolut EUR, Added by you. */
  sourceOptions: { key: string; label: string }[];
}) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

  return (
    <BottomSheet open={open} onClose={onClose} title="Filters">
      <SheetBody className="space-y-6">
        <fieldset>
          <legend className="text-sm font-medium text-muted">Type</legend>
          <div className="mt-2">
            <SegmentedControl<Filters["direction"]>
              label="Spent or received"
              value={filters.direction}
              onChange={(direction) => set({ direction })}
              options={[
                { value: "all", label: "All" },
                { value: "out", label: "Spent" },
                { value: "in", label: "Received" },
              ]}
            />
          </div>
        </fieldset>

        <ChipPicker
          legend="Category"
          value={filters.category}
          onChange={(category) => set({ category })}
          options={[{ id: "all", label: "All" }, { id: "none", label: "Not categorized" }, ...categories]}
        />

        <ChipPicker
          legend="Account"
          value={filters.source}
          onChange={(source) => set({ source })}
          options={[{ id: "all", label: "All" }, ...sourceOptions.map((o) => ({ id: o.key, label: o.label }))]}
        />

        <Toggle
          title="Show all months"
          description="Ignore the selected month"
          checked={filters.allMonths}
          onChange={(allMonths) => set({ allMonths })}
        />
      </SheetBody>
      <SheetFooter>
        <Button variant="secondary" onClick={onReset}>
          Reset
        </Button>
        <Button fullWidth onClick={onClose}>
          Show {resultCount} {resultCount === 1 ? "result" : "results"}
        </Button>
      </SheetFooter>
    </BottomSheet>
  );
}
