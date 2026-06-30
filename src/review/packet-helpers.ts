import type { W2 } from "@/lib/w2-schema";
import type { PacketDocument } from "@/state/document-context";
import type { ReconcileDocInput } from "@/review/reconcile";

/** The current W-2 for a doc: the corrected draft if present, else the raw extraction. */
export function docCurrentW2(doc: PacketDocument): W2 | null {
  return doc.draft ?? doc.extraction?.w2 ?? null;
}

/** Reconciliation inputs from the packet — only extracted docs, using CORRECTED data. */
export function reconcileInputs(documents: PacketDocument[]): ReconcileDocInput[] {
  return documents
    .map((d) => {
      const w2 = docCurrentW2(d);
      return w2 ? { id: d.id, w2 } : null;
    })
    .filter((x): x is ReconcileDocInput => x !== null);
}

export type DocSummary =
  | { kind: "extracting" }
  | { kind: "failed" }
  | { kind: "pending" }
  | { kind: "done"; errors: number; reviews: number; verified: number; ready: boolean };

/** Per-document triage summary for the dashboard row (mirrors the review pane's counts). */
export function docSummary(doc: PacketDocument): DocSummary {
  if (doc.extractStatus === "extracting") return { kind: "extracting" };
  if (doc.extractStatus === "error") return { kind: "failed" };
  if (!doc.validation) return { kind: "pending" };

  let errors = 0;
  let reviews = 0;
  for (const [path, fs] of Object.entries(doc.validation.byField)) {
    if (doc.confirmed.includes(path)) continue;
    if (fs.status === "error") errors++;
    else if (fs.status === "review") reviews++;
  }
  return { kind: "done", errors, reviews, verified: doc.confirmed.length, ready: errors === 0 && reviews === 0 };
}
