import type { W2 } from "./w2-schema.js";

/**
 * EXPORT MODULE ("into tax software downstream")
 * ----------------------------------------------
 * Honest framing for the writeup: there is NO single universal import format
 * across preparer software. Drake, Lacerte/ProSeries, and UltraTax each ingest
 * via their own mappings; the SSA's EFW2 (formerly MMREF-1) is the canonical
 * electronic W-2 record but is oriented to employer-to-SSA filing, not prep
 * import. So the pragmatic, defensible deliverable is a CLEAN, BOX-KEYED,
 * NORMALIZED record plus CSV — values keyed to IRS box numbers (the stable
 * interface every vendor maps from) — rather than pretending to emit one
 * vendor's proprietary file. A production integration would add a per-vendor
 * adapter on top of this normalized shape.
 *
 * We export VALUES ONLY (not bounding boxes / raw strings) — downstream software
 * wants the data, and we keep the audit trail separately.
 */

/** Normalized, box-keyed record. This is the stable contract downstream maps from. */
export interface W2Record {
  taxYear: number | null;
  employer: { name: string | null; ein: string | null; address: string | null };
  employee: { name: string | null; ssn: string | null; address: string | null };
  controlNumber: string | null;
  box1_wages: number | null;
  box2_federalWithholding: number | null;
  box3_socialSecurityWages: number | null;
  box4_socialSecurityTax: number | null;
  box5_medicareWages: number | null;
  box6_medicareTax: number | null;
  box7_socialSecurityTips: number | null;
  box8_allocatedTips: number | null;
  box10_dependentCare: number | null;
  box11_nonqualifiedPlans: number | null;
  box12: { code: string | null; amount: number | null }[];
  box13: W2["box13"];
  box14_other: { label: string | null; amount: number | null }[];
  stateLocal: {
    state: string | null;
    employerStateId: string | null;
    box16_stateWages: number | null;
    box17_stateIncomeTax: number | null;
    box18_localWages: number | null;
    box19_localIncomeTax: number | null;
    box20_localityName: string | null;
  }[];
}

export function toRecord(w2: W2): W2Record {
  const v = <T>(f: { value: T | null }) => f.value;
  return {
    taxYear: w2.taxYear.value,
    employer: { name: v(w2.employer.name), ein: v(w2.employer.ein), address: v(w2.employer.address) },
    employee: { name: v(w2.employee.name), ssn: v(w2.employee.ssn), address: v(w2.employee.address) },
    controlNumber: v(w2.controlNumber),
    box1_wages: v(w2.box1_wages),
    box2_federalWithholding: v(w2.box2_fedWithholding),
    box3_socialSecurityWages: v(w2.box3_ssWages),
    box4_socialSecurityTax: v(w2.box4_ssTax),
    box5_medicareWages: v(w2.box5_medicareWages),
    box6_medicareTax: v(w2.box6_medicareTax),
    box7_socialSecurityTips: v(w2.box7_ssTips),
    box8_allocatedTips: v(w2.box8_allocatedTips),
    box10_dependentCare: v(w2.box10_dependentCare),
    box11_nonqualifiedPlans: v(w2.box11_nonqualifiedPlans),
    box12: w2.box12.map((e) => ({ code: v(e.code), amount: v(e.amount) })),
    box13: w2.box13,
    box14_other: w2.box14_other.map((e) => ({ label: v(e.label), amount: v(e.amount) })),
    stateLocal: w2.stateLocal.map((s) => ({
      state: v(s.state),
      employerStateId: v(s.employerStateId),
      box16_stateWages: v(s.stateWages),
      box17_stateIncomeTax: v(s.stateIncomeTax),
      box18_localWages: v(s.localWages),
      box19_localIncomeTax: v(s.localIncomeTax),
      box20_localityName: v(s.localityName),
    })),
  };
}

export function toJSON(w2: W2): string {
  return JSON.stringify(toRecord(w2), null, 2);
}

/** Flat CSV, one row per W-2. State rows are flattened to the first state for the
 *  scalar columns; full multi-state detail lives in the JSON export. */
export function toCSV(records: W2Record[]): string {
  const cols: [string, (r: W2Record) => string | number | null][] = [
    ["tax_year", (r) => r.taxYear],
    ["employee_name", (r) => r.employee.name],
    ["employee_ssn", (r) => r.employee.ssn],
    ["employer_name", (r) => r.employer.name],
    ["employer_ein", (r) => r.employer.ein],
    ["box1_wages", (r) => r.box1_wages],
    ["box2_federal_withholding", (r) => r.box2_federalWithholding],
    ["box3_ss_wages", (r) => r.box3_socialSecurityWages],
    ["box4_ss_tax", (r) => r.box4_socialSecurityTax],
    ["box5_medicare_wages", (r) => r.box5_medicareWages],
    ["box6_medicare_tax", (r) => r.box6_medicareTax],
    ["box16_state_wages", (r) => r.stateLocal[0]?.box16_stateWages ?? null],
    ["box17_state_tax", (r) => r.stateLocal[0]?.box17_stateIncomeTax ?? null],
    ["state", (r) => r.stateLocal[0]?.state ?? null],
  ];
  const esc = (x: string | number | null) => {
    if (x == null) return "";
    const s = String(x);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = cols.map(([h]) => h).join(",");
  const rows = records.map((r) => cols.map(([, f]) => esc(f(r))).join(","));
  return [header, ...rows].join("\n");
}
