import type { W2 } from "@/lib/w2-schema";
import { constantsForYear, round2 } from "@/lib/tax-constants";
import type { FormDefinition, FormInstance, Issue, ValidationContext } from "./types";

/**
 * FORM W-2 — as a declarative definition.
 * ---------------------------------------
 * This is the proof that W-2 is "just the first definition": all the W-2 knowledge
 * the engine needs lives HERE (schema, rules, custom logic, output mapping), and
 * the engine reads it generically. Adding 1099-NEC is writing a sibling file, not
 * editing the engine.
 *
 * Design tradeoff (say this in the writeup): most checks are declarative rule
 * primitives (config). The two genuinely W-2-specific things — the Additional
 * Medicare surtax and the Box 1/Box 5 pre-tax-deferral reconciliation — don't fit
 * a clean primitive, so they live in `customValidate`, the escape hatch. That
 * split is the point: common rules are data; complex rules drop into code.
 */

/** Box 12 codes for PRE-TAX elective deferrals that reduce Box 1 but not Box 5.
 *  (Roth codes AA/BB/EE are post-tax and intentionally excluded.) */
const PRETAX_DEFERRAL_CODES = new Set(["D", "E", "F", "G", "H", "S"]);

/** Penny-level rounding accumulates in absolute cents, not proportionally, so an
 *  absolute tolerance cleanly separates rounding noise from a real data error. */
const MATH_TOLERANCE_USD = 2.0;

const num = (f: { value: number | string | null }): number | null =>
  typeof f.value === "number" ? f.value : f.value == null ? null : Number(f.value);

export const w2Definition: FormDefinition<W2> = {
  id: "w2",
  name: "Form W-2",
  taxYears: [2000, 2026],

  // --- schema: the fields, their kinds, groups, and which get a second read ---
  schema: [
    { id: "employee.name", label: "Employee name", box: "Box e", type: "text", group: "Employee" },
    { id: "employee.ssn", label: "Social Security number", box: "Box a", type: "ssn", group: "Employee", crossRead: true },
    { id: "employee.address", label: "Address", type: "text", group: "Employee" },
    { id: "employer.name", label: "Employer name", box: "Box c", type: "text", group: "Employer" },
    { id: "employer.ein", label: "EIN", box: "Box b", type: "ein", group: "Employer", crossRead: true },
    { id: "employer.address", label: "Address", type: "text", group: "Employer" },
    { id: "controlNumber", label: "Control number", box: "Box d", type: "text", group: "Employer" },
    { id: "taxYear", label: "Tax year", type: "year", group: "Federal" },
    { id: "box1_wages", label: "Wages, tips, other comp.", box: "Box 1", type: "money", group: "Federal", crossRead: true },
    { id: "box2_fedWithholding", label: "Federal income tax withheld", box: "Box 2", type: "money", group: "Federal", crossRead: true },
    { id: "box3_ssWages", label: "Social Security wages", box: "Box 3", type: "money", group: "Federal" },
    { id: "box4_ssTax", label: "Social Security tax withheld", box: "Box 4", type: "money", group: "Federal" },
    { id: "box5_medicareWages", label: "Medicare wages and tips", box: "Box 5", type: "money", group: "Federal" },
    { id: "box6_medicareTax", label: "Medicare tax withheld", box: "Box 6", type: "money", group: "Federal" },
    { id: "box7_ssTips", label: "Social Security tips", box: "Box 7", type: "money", group: "Federal" },
  ],

  // --- rules: the checks that fit a primitive, as DATA ------------------------
  rules: [
    { kind: "required", field: "employer.name", code: "MISSING_REQUIRED" },
    { kind: "required", field: "employer.ein", code: "MISSING_REQUIRED" },
    { kind: "required", field: "employee.name", code: "MISSING_REQUIRED" },
    { kind: "required", field: "employee.ssn", code: "MISSING_REQUIRED" },
    { kind: "required", field: "box1_wages", code: "MISSING_REQUIRED" },

    { kind: "nonNegative", field: "box1_wages", code: "NEGATIVE" },
    { kind: "nonNegative", field: "box2_fedWithholding", code: "NEGATIVE" },
    { kind: "nonNegative", field: "box3_ssWages", code: "NEGATIVE" },
    { kind: "nonNegative", field: "box4_ssTax", code: "NEGATIVE" },
    { kind: "nonNegative", field: "box5_medicareWages", code: "NEGATIVE" },
    { kind: "nonNegative", field: "box6_medicareTax", code: "NEGATIVE" },
    { kind: "nonNegative", field: "box7_ssTips", code: "NEGATIVE" },

    { kind: "format", field: "employer.ein", format: "ein", code: "EIN_FORMAT" },
    { kind: "format", field: "employee.ssn", format: "ssn", code: "SSN_FORMAT", rangeCode: "SSN_INVALID_RANGE" },

    // Box 2 (federal withholding) can't exceed Box 1 (wages).
    { kind: "cannotExceed", field: "box2_fedWithholding", max: "box1_wages", code: "WITHHOLDING_GT_WAGES", severity: "error" },
    // Box 3 + Box 7 can't exceed the year's Social Security wage base.
    { kind: "cannotExceed", fields: ["box3_ssWages", "box7_ssTips"], maxFromCtx: "ssWageBase", code: "SS_CAP_EXCEEDED", severity: "error" },

    // Box 4 = 6.2% of (Box 3 + Box 7), capped at the wage base, ≤ the annual max.
    {
      kind: "percentageOf",
      field: "box4_ssTax",
      of: ["box3_ssWages", "box7_ssTips"],
      pct: 0.062,
      capFromCtx: "ssWageBase",
      maxFromCtx: "maxSsTax",
      mismatchCode: "SS_TAX_MISMATCH",
      overMaxCode: "SS_TAX_OVER_MAX",
    },
  ],

  // --- adapters: flatten the nested W-2 into the engine's flat field map -------
  toInstance: (w2: W2): FormInstance => ({
    formType: "w2",
    fields: {
      "employee.name": w2.employee.name,
      "employee.ssn": w2.employee.ssn,
      "employee.address": w2.employee.address,
      "employer.name": w2.employer.name,
      "employer.ein": w2.employer.ein,
      "employer.address": w2.employer.address,
      controlNumber: w2.controlNumber,
      box1_wages: w2.box1_wages,
      box2_fedWithholding: w2.box2_fedWithholding,
      box3_ssWages: w2.box3_ssWages,
      box4_ssTax: w2.box4_ssTax,
      box5_medicareWages: w2.box5_medicareWages,
      box6_medicareTax: w2.box6_medicareTax,
      box7_ssTips: w2.box7_ssTips,
    },
  }),
  taxYearField: (w2: W2) => w2.taxYear,

  resolveContext: (year) => {
    const { used, resolvedYear, exact } = constantsForYear(year);
    const ctx: ValidationContext = {
      constants: {
        ssWageBase: used.ssWageBase,
        ssRate: used.ssRate,
        maxSsTax: used.maxSsTax,
        medicareRate: used.medicareRate,
        additionalMedicareRate: used.additionalMedicareRate,
        additionalMedicareThreshold: used.additionalMedicareThreshold,
      },
      resolvedYear,
      tolerance: MATH_TOLERANCE_USD,
    };
    return { ctx, resolvedYear, exact };
  },

  /**
   * The escape hatch: logic that doesn't fit a clean primitive.
   *  - Box 6 = 1.45% of Box 5 PLUS the 0.9% Additional Medicare surtax over $200k.
   *  - Medicare wages (Box 5) should normally be ≥ SS wages (Box 3).
   *  - Box 1 vs Box 5: they legitimately differ (pre-tax deferrals); rather than
   *    flag that, we RECONCILE the gap against the Box 12 deferral codes the form
   *    itself reports. This is the smartest check and stays exactly as it was.
   *  - Federal withholding plausibility (unusually high % of wages).
   */
  customValidate: (w2: W2, ctx: ValidationContext): Issue[] => {
    const out: Issue[] = [];
    const c = ctx.constants;
    const tol = ctx.tolerance;
    const add = (field: string, severity: Issue["severity"], code: string, message: string) =>
      out.push({ field, severity, code, message });

    const medWages = num(w2.box5_medicareWages);
    const box6 = num(w2.box6_medicareTax);
    if (medWages != null && box6 != null) {
      const addlBase = Math.max(0, medWages - c.additionalMedicareThreshold);
      const expected = round2(medWages * c.medicareRate + addlBase * c.additionalMedicareRate);
      if (Math.abs(box6 - expected) > tol) {
        const note = addlBase > 0 ? ` (includes +0.9% Additional Medicare on $${round2(addlBase).toLocaleString()} over $200k)` : "";
        add("box6_medicareTax", "error", "MEDICARE_TAX_MISMATCH", `Box 6 should be ~1.45% of Box 5${note}. Expected ~$${expected.toLocaleString()}, found $${box6.toLocaleString()}.`);
      }
    }

    const ssWages = num(w2.box3_ssWages);
    if (medWages != null && ssWages != null && ssWages > medWages + tol) {
      add("box5_medicareWages", "warning", "MEDICARE_LT_SS", `Box 5 (Medicare wages, uncapped) is less than Box 3 (SS wages). Usually Box 5 ≥ Box 3 — worth a look.`);
    }

    const box1 = num(w2.box1_wages);
    if (box1 != null && medWages != null) {
      if (box1 > medWages + tol) {
        add("box1_wages", "warning", "BOX1_GT_BOX5", `Box 1 exceeds Box 5 (Medicare wages). Unusual — Medicare wages typically include everything in Box 1 plus pre-tax deferrals.`);
      } else {
        const gap = round2(medWages - box1);
        const deferrals = round2(
          w2.box12
            .filter((e) => e.code.value && PRETAX_DEFERRAL_CODES.has(String(e.code.value).toUpperCase()))
            .reduce((s, e) => s + (e.amount.value ?? 0), 0),
        );
        if (gap > tol && deferrals > 0) {
          if (Math.abs(gap - deferrals) <= tol) add("box1_wages", "info", "DEFERRAL_RECONCILES", `Box 5 − Box 1 = $${gap.toLocaleString()} reconciles with Box 12 pre-tax deferrals. Consistent.`);
          else add("box1_wages", "info", "DEFERRAL_PARTIAL", `Box 5 − Box 1 = $${gap.toLocaleString()} vs $${deferrals.toLocaleString()} of Box 12 deferrals — the rest is likely Section 125/cafeteria amounts.`);
        }
      }
    }

    const box2 = num(w2.box2_fedWithholding);
    if (box1 != null && box2 != null && box1 > 0 && box2 <= box1 && box2 / box1 > 0.4) {
      add("box2_fedWithholding", "warning", "WITHHOLDING_HIGH", `Federal withholding is ${Math.round((box2 / box1) * 100)}% of wages — unusually high, confirm against the source.`);
    }

    return out;
  },

  // --- where each field goes downstream (box → 1040) --------------------------
  outputMapping: {
    box1_wages: { target: "1040 line 1a — wages", exportKey: "box1_wages" },
    box2_fedWithholding: { target: "1040 line 25a — federal tax withheld", exportKey: "box2_federalWithholding" },
    box3_ssWages: { target: "SS wages (informational)", exportKey: "box3_socialSecurityWages" },
    box4_ssTax: { target: "excess SS tax if multi-employer (Schedule 3)", exportKey: "box4_socialSecurityTax" },
    box5_medicareWages: { target: "Medicare wages (informational)", exportKey: "box5_medicareWages" },
    box6_medicareTax: { target: "Medicare tax (informational)", exportKey: "box6_medicareTax" },
    "box17_stateIncomeTax": { target: "Schedule A — state income tax (if itemizing)", exportKey: "box17_stateIncomeTax" },
  },
};
