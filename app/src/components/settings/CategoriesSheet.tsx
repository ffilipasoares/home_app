import { useState } from "react";
import { LockIcon, PlusIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { BottomSheet, SheetBody, SheetFooter } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import { FieldError } from "../ui/fields";
import { CategoryIcon } from "../CategoryIcon";
import { useSave } from "../../lib/useSave";
import { DEFAULT_CATEGORIES } from "../../lib/categories";
import { saveCategories } from "../../lib/settings";
import type { CategoryDef } from "../../types";

type Draft = CategoryDef & { isNew?: boolean };

function slug(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function CategoriesSheet({
  open,
  onClose,
  uid,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  uid: string;
  categories: CategoryDef[];
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Categories">
      <CategoriesForm onClose={onClose} uid={uid} categories={categories} />
    </BottomSheet>
  );
}

/**
 * Rename, add and remove categories. Salary and investments (the "special"
 * ones) can be renamed but not removed: salary detection and the
 * Investments block depend on them.
 */
function CategoriesForm({ onClose, uid, categories }: { onClose: () => void; uid: string; categories: CategoryDef[] }) {
  const [drafts, setDrafts] = useState<Draft[]>(categories);
  const [invalid, setInvalid] = useState<string>();
  const [wasReset, setWasReset] = useState(false);
  const { busy, error, save } = useSave(onClose);

  const update = (id: string, label: string) => {
    setDrafts((prev) => prev.map((c) => (c.id === id ? { ...c, label } : c)));
    setInvalid(undefined);
  };

  function handleSave() {
    const cleaned = drafts.map((c) => ({ ...c, label: c.label.trim() }));
    if (cleaned.some((c) => !c.label)) {
      setInvalid("Every category needs a name.");
      return;
    }
    const names = cleaned.map((c) => c.label.toLowerCase());
    if (new Set(names).size !== names.length) {
      setInvalid("Two categories have the same name.");
      return;
    }
    // New categories get an id from their name, kept unique; existing ids never change.
    const taken = new Set(cleaned.filter((c) => !c.isNew).map((c) => c.id));
    const next: CategoryDef[] = cleaned.map(({ isNew, ...c }) => {
      if (!isNew) return c;
      const base = slug(c.label) || "category";
      let id = base;
      for (let n = 2; taken.has(id); n++) id = `${base}_${n}`;
      taken.add(id);
      return { ...c, id };
    });
    save(() => saveCategories(uid, next));
  }

  return (
    <>
      <SheetBody className="space-y-0">
        <p className="text-sm text-muted">
          The AI chooses from these. Transactions in a category you remove keep it until you recategorize them.
        </p>
        <ul className="mt-4 space-y-2">
          {drafts.map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              <CategoryIcon category={c} />
              <input
                value={c.label}
                onChange={(e) => update(c.id, e.target.value)}
                aria-label="Category name"
                placeholder="Category name"
                className="h-11 min-w-0 flex-1 rounded-lg border border-line bg-raised px-3 text-[15px] placeholder:text-subtle focus:border-accent focus:outline-none"
              />
              {c.special ? (
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center text-subtle"
                  title={c.special === "income" ? "Salary detection uses it" : "The Investments block uses it"}
                >
                  <LockIcon className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">Needed by the app, can't be removed</span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setDrafts((prev) => prev.filter((x) => x.id !== c.id))}
                  aria-label={`Remove ${c.label || "category"}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-raised hover:text-negative"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() =>
              setDrafts((prev) => [...prev, { id: `new_${Date.now().toString(36)}`, label: "", isNew: true }])
            }
            className="flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
          >
            <PlusIcon className="h-4 w-4" aria-hidden="true" /> Add category
          </button>
          <button
            type="button"
            onClick={() => {
              setDrafts(DEFAULT_CATEGORIES);
              setWasReset(true);
              setInvalid(undefined);
            }}
            className="flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
          >
            <RotateCcwIcon className="h-3.5 w-3.5" aria-hidden="true" /> Reset to defaults
          </button>
        </div>
        {wasReset && (
          <p className="mt-3 text-[13px] text-muted">
            Back to the default list ({DEFAULT_CATEGORIES.map((c) => c.label).join(", ")}). Nothing changes until you
            save; transactions in a category not in this list keep it until recategorized.
          </p>
        )}
        {(invalid || error) && <FieldError>{invalid ?? error}</FieldError>}
      </SheetBody>
      <SheetFooter>
        <Button variant="secondary" fullWidth onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button fullWidth onClick={handleSave} disabled={busy}>
          {busy ? "Saving…" : "Save categories"}
        </Button>
      </SheetFooter>
    </>
  );
}
