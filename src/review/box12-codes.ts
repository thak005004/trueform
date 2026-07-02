/**
 * IRS Form W-2 Box 12 code meanings. Decoding these inline signals that the tool
 * understands W-2s, not just OCR — a preparer sees "D · 401(k) elective deferral"
 * instead of a bare code. (Box 14 is employer-defined free text, so no standard map.)
 */
export const BOX12_CODES: Record<string, string> = {
  A: "Uncollected Social Security tax on tips",
  B: "Uncollected Medicare tax on tips",
  C: "Taxable group-term life insurance over $50k",
  D: "401(k) elective deferral",
  E: "403(b) elective deferral",
  F: "408(k)(6) SEP elective deferral",
  G: "457(b) elective deferral",
  H: "501(c)(18)(D) elective deferral",
  J: "Nontaxable sick pay",
  K: "20% excise tax on golden-parachute payments",
  L: "Substantiated employee business-expense reimbursements",
  M: "Uncollected Social Security tax on group-term life (former employee)",
  N: "Uncollected Medicare tax on group-term life (former employee)",
  P: "Excludable moving-expense reimbursements (armed forces)",
  Q: "Nontaxable combat pay",
  R: "Employer contributions to an Archer MSA",
  S: "408(p) SIMPLE elective deferral",
  T: "Adoption benefits",
  V: "Income from exercise of nonstatutory stock options",
  W: "Employer + employee HSA contributions",
  Y: "Section 409A deferrals",
  Z: "Section 409A nonqualified deferred-comp income",
  AA: "Roth 401(k) contribution",
  BB: "Roth 403(b) contribution",
  DD: "Cost of employer-sponsored health coverage",
  EE: "Roth 457(b) contribution",
  FF: "Permitted QSEHRA benefits",
  GG: "Income from qualified equity grants (§83(i))",
  HH: "Aggregate deferrals under §83(i) elections",
};

/** Human-readable meaning of a Box 12 code, or null if unknown/blank. */
export function box12Label(code: string | null | undefined): string | null {
  if (!code) return null;
  return BOX12_CODES[code.toUpperCase().trim()] ?? null;
}

/**
 * Is this a real IRS Box 12 code (A–HH)? A blank code counts as "not populated",
 * not invalid. A non-empty code that isn't in the official set is a likely misread
 * — e.g. the extractor pulling a Box 14 label ("14H") into Box 12. Real W-2s
 * surfaced exactly this, and it isn't caught by the tax math.
 */
export function isValidBox12Code(code: string | null | undefined): boolean {
  const c = code?.trim();
  if (!c) return true; // empty ≠ invalid
  return Object.prototype.hasOwnProperty.call(BOX12_CODES, c.toUpperCase());
}
