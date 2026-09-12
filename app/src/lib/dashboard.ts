import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../firebase";
import type { DashboardDoc } from "../types";

function dashboardsCol(uid: string) {
  return collection(db, "users", uid, "dashboards");
}

/** The dashboards/{month} doc is written server-side by the recomputeMonth Cloud Function — the client only ever reads it. */
export function subscribeDashboard(
  uid: string,
  month: string,
  cb: (dashboard: DashboardDoc | null) => void,
) {
  return onSnapshot(doc(dashboardsCol(uid), month), (snap) => {
    cb((snap.data() as DashboardDoc | undefined) ?? null);
  });
}

export function subscribeAvailableMonths(uid: string, cb: (months: string[]) => void) {
  const q = query(dashboardsCol(uid), orderBy("month", "desc"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => d.id));
  });
}
