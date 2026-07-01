import type { W2 } from "@/lib/w2-schema";
import { toCSV, toRecord } from "@/lib/export";
import type { AuditEntry } from "@/state/document-context";
import { buildEFW2, fieldMap } from "./efw2.js";

/**
 * Client-side export. We run the CURRENT (post-edit) W-2 through the lib's
 * export helpers — toJSON / toRecord / toCSV — and trigger a real browser
 * download via a Blob object URL. No server round-trip; the corrected data
 * never has to leave the page to be exported.
 */

function slug(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

/** e.g. "marcus_t_halloran_w2_2025" — falls back gracefully if name/year missing. */
export function exportBaseName(w2: W2): string {
  const name = w2.employee?.name?.value;
  const year = w2.taxYear?.value;
  const yearPart = year != null ? `_${year}` : "";
  const namePart = name ? slug(name) : "";
  return namePart ? `${namePart}_w2${yearPart}` : `w2_export${yearPart}`;
}

function triggerDownload(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadJSON(w2: W2, audit: AuditEntry[] = []) {
  // Box-keyed record at TOP LEVEL (drop-in for downstream import), plus an optional
  // reviewAudit block — provenance matters in liability-heavy tax work, and it's
  // safely ignorable by any importer that only reads the box fields.
  const payload = {
    ...toRecord(w2),
    reviewAudit: {
      corrections: audit.filter((a) => a.action === "edit").length,
      confirmations: audit.filter((a) => a.action === "confirmed").length,
      entries: audit,
    },
  };
  triggerDownload(JSON.stringify(payload, null, 2), `${exportBaseName(w2)}.json`, "application/json");
}

export function downloadCSV(w2: W2) {
  // One record per W-2; toCSV takes an array (it supports multi-doc packets).
  triggerDownload(toCSV([toRecord(w2)]), `${exportBaseName(w2)}.csv`, "text/csv;charset=utf-8");
}

export function downloadEFW2(w2: W2) {
  // The SSA electronic-filing record layout — the literal "into tax software" format.
  triggerDownload(buildEFW2(w2), `${exportBaseName(w2)}.efw2.txt`, "text/plain;charset=us-ascii");
}

export function downloadFieldMap(w2: W2) {
  // Human-readable box -> 1040 mapping, so a preparer knows where each value lands.
  const payload = { form: "W-2", taxYear: w2.taxYear.value, mapping: fieldMap(w2) };
  triggerDownload(JSON.stringify(payload, null, 2), `${exportBaseName(w2)}.import-map.json`, "application/json");
}
