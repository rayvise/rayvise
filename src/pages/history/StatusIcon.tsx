import { CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import type { CompletionListEntry } from "#/services/db";

// Status Icon display for history page
export function StatusIcon({ row }: { row: Pick<CompletionListEntry, "hadError" | "wasApplied"> }) {
  if (row.hadError) {
    return <AlertCircle size={13} className="shrink-0 text-red-500" />;
  }

  if (row.wasApplied) {
    return <CheckCircle2 size={13} className="shrink-0 text-emerald-500" />;
  }

  return <XCircle size={13} className="shrink-0 text-red-400" />;
}
