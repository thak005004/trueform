import type { W2 } from "./w2-schema.js";
import { constantsForYear, round2 } from "./tax-constants.js";

/**
 * VALIDATION ENGINE
 * -----------------
 * Design thesis: a tax preparer's trust is earned by CHECKS THEY CAN VERIFY,
 * not by a model telling them how confident it feels. LLM self-reported
 * confidence is poorly calibrated — a model will report high confidence on a
 * transposed digit. So every "needs review" flag below comes from arithmetic
 * the W-2 must satisfy, format rules, or cross-field reconciliation. None of it
 * comes from the model's opinion of its own output.
 *
 * Each rule emits an Issue. A field's review status is DERIVED from the issues
 * that reference it, which is what drives the triage UI (ok / review / error).
 */

export type Severity = "error" | "warning" | "info";

export interface Issue {
  /** dot-path into the W2 object, e.g. "box4_ssTax" — links issue to a field */
  field: string;
  severity: Severity;
  code: string;
  message: string;
}

export interface FieldStatus {
  status: "ok" | "review" | "error";
  issues: Issue[];
}

export interface ValidationResult {
  issues: Issue[];
  byField: Record<string, FieldStatus>;
  summary: { errors: number; warnings: number; infos: number };
  resolvedTaxYear: number;
  taxYearExact: boolean;
}

/**
 * Tolerance for payroll-math checks, in dollars. The error model here is
 * penny-level rounding accumulated across pay periods, which is ABSOLUTE
 * (a few cents), not proportional — so an absolute tolerance is correct.
 * Genuine data-entry errors (a transposed digit, wrong box) miss by far more
 * than $2, so this cleanly separates rounding noise from real problems.
 */
const MATH_TOLERANCE_USD = 2.0;

/** Box 12 codes for PRE-TAX elective deferrals that reduce Box 1 but not Box 5.
 *  (Roth codes AA/BB/EE are post-tax and intentionally excluded.) */
const PRETAX_DEFERRAL_CODES = new Set(["D", "E", "F", "G", "H", "S"]);

const num = (f: { value: number | null }) => f.value ?? null;

export function validateW2(w2: W2): ValidationResult {
  const issues: Issue[] = [];
  const add = (
    field: string,
    severity: Severity,
    code: string,
    message: string,
  ) => issues.push({ field, severity, code, message });

  const { used: c, resolvedYear, exact } = constantsForYear(w2.taxYear.value);

  if (!w2.taxYear.present || w2.taxYear.value == null) {
    add(
      "taxYear",
      "warning",
      "TAX_YEAR_MISSING",
      `Tax year not found. Validation used ${resolvedYear} constants as a fallback — confirm the year, since the SS wage base differs each year.`,
    );
  } else if (w2.taxYear.value < 2000 || w2.taxYear.value > resolvedYear + 1) {
    add("taxYear", "warning", "TAX_YEAR_RANGE", `Tax year ${w2.taxYear.value} looks out of range.`);
  } else if (!exact) {
    add(
      "taxYear",
      "info",
      "TAX_YEAR_FALLBACK",
      `No constants on file for ${w2.taxYear.value}; used ${resolvedYear}.`,
    );
  }

  // --- Required identity & core fields ----------------------------------
  const required: [string, { present: boolean; value: unknown }][] = [
    ["employer.name", w2.employer.name],
    ["employer.ein", w2.employer.ein],
    ["employee.name", w2.employee.name],
    ["employee.ssn", w2.employee.ssn],
    ["box1_wages", w2.box1_wages],
  ];
  for (const [path, f] of required) {
    if (!f.present || f.value == null || f.value === "") {
      add(path, "warning", "MISSING_REQUIRED", `Required field is missing or unreadable — needs review.`);
    }
  }

  // --- Non-negative money ------------------------------------------------
  const moneyBoxes: [string, { value: number | null }][] = [
    ["box1_wages", w2.box1_wages],
    ["box2_fedWithholding", w2.box2_fedWithholding],
    ["box3_ssWages", w2.box3_ssWages],
    ["box4_ssTax", w2.box4_ssTax],
    ["box5_medicareWages", w2.box5_medicareWages],
    ["box6_medicareTax", w2.box6_medicareTax],
    ["box7_ssTips", w2.box7_ssTips],
  ];
  for (const [path, f] of moneyBoxes) {
    const v = num(f);
    if (v != null && v < 0) add(path, "error", "NEGATIVE", `${path} is negative, which is not valid on a W-2.`);
  }

  // --- Formats: EIN, SSN -------------------------------------------------
  if (w2.employer.ein.value) {
    // Lenient by design: a missing hyphen is cosmetic. We only flag when the
    // digit count is actually wrong, which signals a real misread.
    const einDigits = w2.employer.ein.value.replace(/\D/g, "");
    if (einDigits.length !== 9)
      add("employer.ein", "warning", "EIN_FORMAT", `EIN "${w2.employer.ein.value}" doesn't contain 9 digits (NN-NNNNNNN).`);
  }
  if (w2.employee.ssn.value) {
    const ssn = w2.employee.ssn.value.replace(/-/g, "").trim();
    if (!/^\d{9}$/.test(ssn)) {
      add("employee.ssn", "warning", "SSN_FORMAT", `SSN "${w2.employee.ssn.value}" isn't in NNN-NN-NNNN form.`);
    } else {
      const area = ssn.slice(0, 3);
      if (area === "000" || area === "666" || Number(area) >= 900)
        add("employee.ssn", "warning", "SSN_INVALID_RANGE", `SSN area "${area}" is never validly issued.`);
    }
  }

  // --- Social Security wage cap (Box 3 + Box 7 <= base) ------------------
  const ssWages = num(w2.box3_ssWages) ?? 0;
  const ssTips = num(w2.box7_ssTips) ?? 0;
  const ssTaxable = ssWages + ssTips;
  if (ssTaxable > c.ssWageBase + MATH_TOLERANCE_USD) {
    add(
      "box3_ssWages",
      "error",
      "SS_CAP_EXCEEDED",
      `Box 3 + Box 7 = $${round2(ssTaxable).toLocaleString()} exceeds the ${resolvedYear} Social Security wage base of $${c.ssWageBase.toLocaleString()}. Not possible on a correct W-2.`,
    );
  }

  // --- Box 4 = 6.2% of (Box 3 + Box 7), capped at the annual max ---------
  const box4 = num(w2.box4_ssTax);
  if (box4 != null) {
    const taxable = Math.min(ssTaxable, c.ssWageBase);
    const expected = round2(taxable * c.ssRate);
    if (box4 > c.maxSsTax + MATH_TOLERANCE_USD) {
      add("box4_ssTax", "error", "SS_TAX_OVER_MAX", `Box 4 ($${box4.toLocaleString()}) exceeds the ${resolvedYear} max Social Security tax of $${c.maxSsTax.toLocaleString()}.`);
    } else if (Math.abs(box4 - expected) > MATH_TOLERANCE_USD) {
      add(
        "box4_ssTax",
        "error",
        "SS_TAX_MISMATCH",
        `Box 4 should be ~6.2% of Box 3+7. Expected ~$${expected.toLocaleString()}, found $${box4.toLocaleString()} (off by $${round2(Math.abs(box4 - expected)).toLocaleString()}).`,
      );
    }
  }

  // --- Box 6 = 1.45% of Box 5, plus 0.9% over $200k ---------------------
  const medWages = num(w2.box5_medicareWages);
  const box6 = num(w2.box6_medicareTax);
  if (medWages != null && box6 != null) {
    const addlBase = Math.max(0, medWages - c.additionalMedicareThreshold);
    const expected = round2(medWages * c.medicareRate + addlBase * c.additionalMedicareRate);
    if (Math.abs(box6 - expected) > MATH_TOLERANCE_USD) {
      const note =
        addlBase > 0
          ? ` (includes +0.9% Additional Medicare on $${round2(addlBase).toLocaleString()} over $200k)`
          : "";
      add(
        "box6_medicareTax",
        "error",
        "MEDICARE_TAX_MISMATCH",
        `Box 6 should be ~1.45% of Box 5${note}. Expected ~$${expected.toLocaleString()}, found $${box6.toLocaleString()}.`,
      );
    }
  }

  // --- Medicare wages (Box 5) should normally be >= SS wages (Box 3) -----
  if (medWages != null && ssWages > medWages + MATH_TOLERANCE_USD) {
    add(
      "box5_medicareWages",
      "warning",
      "MEDICARE_LT_SS",
      `Box 5 (Medicare wages, uncapped) is less than Box 3 (SS wages). Usually Box 5 ≥ Box 3 — worth a look.`,
    );
  }

  // --- Box 1 vs Box 5 reconciliation via Box 12 deferrals ---------------
  // We deliberately DO NOT flag Box1 != Box3 != Box5 as an error: they legitimately
  // differ because Box 1 excludes pre-tax 401(k)/403(b) deferrals and Box 3 is capped.
  // Instead we reconcile the gap against the deferral codes the form itself reports.
  const box1 = num(w2.box1_wages);
  if (box1 != null && medWages != null) {
    if (box1 > medWages + MATH_TOLERANCE_USD) {
      add(
        "box1_wages",
        "warning",
        "BOX1_GT_BOX5",
        `Box 1 exceeds Box 5 (Medicare wages). Unusual — Medicare wages typically include everything in Box 1 plus pre-tax deferrals.`,
      );
    } else {
      const gap = round2(medWages - box1);
      const deferrals = round2(
        w2.box12
          .filter((e) => e.code.value && PRETAX_DEFERRAL_CODES.has(e.code.value.toUpperCase()))
          .reduce((s, e) => s + (e.amount.value ?? 0), 0),
      );
      if (gap > MATH_TOLERANCE_USD && deferrals > 0) {
        if (Math.abs(gap - deferrals) <= MATH_TOLERANCE_USD) {
          add("box1_wages", "info", "DEFERRAL_RECONCILES", `Box 5 − Box 1 = $${gap.toLocaleString()} reconciles with Box 12 pre-tax deferrals. Consistent.`);
        } else {
          add("box1_wages", "info", "DEFERRAL_PARTIAL", `Box 5 − Box 1 = $${gap.toLocaleString()} vs $${deferrals.toLocaleString()} of Box 12 deferrals — the rest is likely Section 125/cafeteria amounts.`);
        }
      }
    }
  }

  // --- Federal withholding plausibility (Box 2 vs Box 1) ----------------
  const box2 = num(w2.box2_fedWithholding);
  if (box1 != null && box2 != null && box1 > 0) {
    if (box2 > box1) {
      add("box2_fedWithholding", "error", "WITHHOLDING_GT_WAGES", `Box 2 (federal withholding) exceeds Box 1 (wages). Not possible.`);
    } else if (box2 / box1 > 0.4) {
      add("box2_fedWithholding", "warning", "WITHHOLDING_HIGH", `Federal withholding is ${Math.round((box2 / box1) * 100)}% of wages — unusually high, confirm against the source.`);
    }
  }

  // --- Derive per-field status from issues ------------------------------
  const byField: Record<string, FieldStatus> = {};
  for (const iss of issues) {
    const fs = (byField[iss.field] ??= { status: "ok", issues: [] });
    fs.issues.push(iss);
    if (iss.severity === "error") fs.status = "error";
    else if (iss.severity === "warning" && fs.status !== "error") fs.status = "review";
  }

  const summary = {
    errors: issues.filter((i) => i.severity === "error").length,
    warnings: issues.filter((i) => i.severity === "warning").length,
    infos: issues.filter((i) => i.severity === "info").length,
  };

  return { issues, byField, summary, resolvedTaxYear: resolvedYear, taxYearExact: exact };
}
