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

// ============================================================================
// PRIOR-YEAR COMPARISON
// ----------------------------------------------------------------------------
// A diligent preparer eyeballs this year vs. last year — that's where errors and
// fraud hide, because a transposed digit that makes wages look 10x is still
// self-consistent and passes the single-form tax math. With the packet holding
// multiple documents, we don't need stored history: drop this year + last year's
// W-2 for the same SSN in together and we surface the year-over-year deltas.
// Deterministic, observable, unit-tested — same philosophy as everything else.
// ============================================================================

export interface YoYNote {
  severity: "warning" | "info";
  message: string;
}

export interface YearOverYear {
  ssnLast4: string;
  employeeName: string | null;
  prior: { year: number; box1: number; box2: number; employer: string | null; docId: string };
  current: { year: number; box1: number; box2: number; employer: string | null; docId: string };
  wageDeltaPct: number | null;
  notes: YoYNote[];
}

const yearOf = (w2: W2) => w2.taxYear?.value ?? null;

// Thresholds for "worth a second look" — absolute signals, not model opinion.
const WAGE_CHANGE_PCT = 30; // year-over-year Box 1 swing
const WITHHOLDING_RATE_SHIFT = 0.05; // 5 percentage points of Box 2 / Box 1

export function yearOverYear(docs: ReconcileDocInput[]): YearOverYear[] {
  // Group extracted docs (with an SSN and a tax year) by SSN.
  const bySsn = new Map<string, ReconcileDocInput[]>();
  for (const d of docs) {
    const ssn = ssnDigits(d.w2);
    if (!ssn || yearOf(d.w2) == null) continue;
    const arr = bySsn.get(ssn);
    if (arr) arr.push(d);
    else bySsn.set(ssn, [d]);
  }

  const out: YearOverYear[] = [];
  for (const [ssn, group] of bySsn) {
    // One doc per distinct year; compare the two most recent years.
    const byYear = new Map<number, ReconcileDocInput>();
    for (const d of group) {
      const yr = yearOf(d.w2)!;
      if (!byYear.has(yr)) byYear.set(yr, d);
    }
    const years = [...byYear.keys()].sort((a, b) => a - b);
    if (years.length < 2) continue;

    const pd = byYear.get(years[years.length - 2])!;
    const cd = byYear.get(years[years.length - 1])!;
    const pBox1 = num(pd.w2.box1_wages);
    const cBox1 = num(cd.w2.box1_wages);
    const pBox2 = num(pd.w2.box2_fedWithholding);
    const cBox2 = num(cd.w2.box2_fedWithholding);
    const pEmp = pd.w2.employer?.name?.value ?? null;
    const cEmp = cd.w2.employer?.name?.value ?? null;

    const wageDeltaPct = pBox1 > 0 ? round2(((cBox1 - pBox1) / pBox1) * 100) : null;
    const notes: YoYNote[] = [];

    if (wageDeltaPct != null && Math.abs(wageDeltaPct) >= WAGE_CHANGE_PCT) {
      notes.push({
        severity: "warning",
        message: `Wages changed more than ${WAGE_CHANGE_PCT}% year over year — confirm it's expected, not a misread.`,
      });
    }
    const normEmp = (s: string) => s.trim().toUpperCase().replace(/\s+/g, " ");
    if (pEmp && cEmp && normEmp(pEmp) !== normEmp(cEmp)) {
      notes.push({ severity: "info", message: `Employer changed: ${pEmp} → ${cEmp}` });
    }
    const pRate = pBox1 > 0 ? pBox2 / pBox1 : null;
    const cRate = cBox1 > 0 ? cBox2 / cBox1 : null;
    if (pRate != null && cRate != null && Math.abs(cRate - pRate) >= WITHHOLDING_RATE_SHIFT) {
      notes.push({
        severity: "warning",
        message: `Federal withholding rate moved from ${Math.round(pRate * 100)}% to ${Math.round(cRate * 100)}% — worth a look.`,
      });
    }

    out.push({
      ssnLast4: ssn.slice(-4),
      employeeName: cd.w2.employee?.name?.value ?? null,
      prior: { year: years[years.length - 2], box1: pBox1, box2: pBox2, employer: pEmp, docId: pd.id },
      current: { year: years[years.length - 1], box1: cBox1, box2: cBox2, employer: cEmp, docId: cd.id },
      wageDeltaPct,
      notes,
    });
  }
  return out;
}
