import type { W2 } from "@/lib/w2-schema";

/**
 * CROSS-DOCUMENT RECONCILIATION
 * -----------------------------
 * A tax preparer processes a client PACKET, not a single form. This pure,
 * deterministic function rolls up totals across the packet's W-2s and flags
 * cross-document inconsistencies — same philosophy as validation.ts: every flag
 * comes from observable data (matching/!matching identity fields), never a
 * model's opinion. Unit-tested; no React, no I/O, no src/lib edits.
 */

export interface ReconcileDocInput {
  id: string;
  /** The CURRENT W-2 for this doc (corrected draft preferred over raw extraction). */
  w2: W2;
}

export type CrossDocSeverity = "error" | "warning" | "info";

export interface CrossDocIssue {
  severity: CrossDocSeverity;
  code: string;
  message: string;
  /** Documents this issue spans, for the UI to link back to. */
  docIds: string[];
}

export interface ReconcileResult {
  aggregates: {
    documentCount: number;
    totalBox1Wages: number;
    totalBox2Withholding: number;
  };
  crossDocIssues: CrossDocIssue[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (f?: { value: number | null }) => f?.value ?? 0;

const ssnDigits = (w2: W2): string | null => {
  const v = w2.employee?.ssn?.value;
  return v ? v.replace(/\D/g, "") : null;
};
const normName = (w2: W2): string | null => {
  const v = w2.employee?.name?.value;
  return v ? v.trim().toUpperCase().replace(/\s+/g, " ") : null;
};
const normAddr = (w2: W2): string | null => {
  const v = w2.employee?.address?.value;
  return v ? v.trim().toUpperCase().replace(/\s+/g, " ") : null;
};

export function reconcilePacket(docs: ReconcileDocInput[]): ReconcileResult {
  const issues: CrossDocIssue[] = [];

  // --- aggregates: roll up the headline money boxes across the packet ---
  const totalBox1Wages = round2(docs.reduce((s, d) => s + num(d.w2.box1_wages), 0));
  const totalBox2Withholding = round2(docs.reduce((s, d) => s + num(d.w2.box2_fedWithholding), 0));

  // --- group documents by normalized SSN ---
  const bySsn = new Map<string, ReconcileDocInput[]>();
  for (const d of docs) {
    const ssn = ssnDigits(d.w2);
    if (!ssn) continue;
    const arr = bySsn.get(ssn);
    if (arr) arr.push(d);
    else bySsn.set(ssn, [d]);
  }

  // Same SSN, different identity → an inconsistency a preparer must resolve.
  for (const [ssn, group] of bySsn) {
    if (group.length < 2) continue;
    const last4 = ssn.slice(-4);

    const names = [...new Set(group.map((d) => normName(d.w2)).filter(Boolean))] as string[];
    if (names.length > 1) {
      issues.push({
        severity: "error",
        code: "SSN_NAME_MISMATCH",
        message: `SSN ending ${last4} appears with different employee names (${names.join(" vs ")}). One SSN should map to one person — check for a misread or a wrong document.`,
        docIds: group.map((d) => d.id),
      });
    }

    const addrs = [...new Set(group.map((d) => normAddr(d.w2)).filter(Boolean))] as string[];
    if (addrs.length > 1) {
      issues.push({
        severity: "warning",
        code: "SSN_ADDRESS_MISMATCH",
        message: `SSN ending ${last4} appears with different addresses — confirm these are the same person.`,
        docIds: group.map((d) => d.id),
      });
    }
  }

  // Different SSNs in one packet → possible wrong-client mixup.
  const distinctSsns = [...bySsn.keys()];
  if (distinctSsns.length > 1) {
    issues.push({
      severity: "warning",
      code: "PACKET_MULTIPLE_SSNS",
      message: `This packet contains W-2s for ${distinctSsns.length} different SSNs — confirm they all belong to the same client.`,
      docIds: docs.filter((d) => ssnDigits(d.w2)).map((d) => d.id),
    });
  }

  return {
    aggregates: { documentCount: docs.length, totalBox1Wages, totalBox2Withholding },
    crossDocIssues: issues,
  };
}
