import { useState } from "react";

/** Runs a save from a sheet: busy while it runs, closes on success, keeps the error to show otherwise. */
export function useSave(onClose: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const save = async (write: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await write();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };
  return { busy, error, save };
}
