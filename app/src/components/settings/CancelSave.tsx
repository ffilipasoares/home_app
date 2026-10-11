import { SheetFooter } from "../ui/BottomSheet";
import { Button } from "../ui/Button";

export function CancelSave({ onClose, onSave, busy }: { onClose: () => void; onSave: () => void; busy: boolean }) {
  return (
    <SheetFooter>
      <Button variant="secondary" fullWidth onClick={onClose} disabled={busy}>
        Cancel
      </Button>
      <Button fullWidth onClick={onSave} disabled={busy}>
        {busy ? "Saving…" : "Save"}
      </Button>
    </SheetFooter>
  );
}
