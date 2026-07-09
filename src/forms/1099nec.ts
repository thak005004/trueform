import { LATEST_KNOWN_YEAR } from "@/lib/tax-constants";
import type { ExtractedField, FormDefinition, FormInstance, Issue, ValidationContext } from "./types";

/**
 * FORM 1099-NEC — the second definition, proving the pattern.
 * ----------------------------------------------------------
 * Written as a sibling of forms/w2.ts with NO changes to the engine. It's flat
 * (no nested arrays), so it uses the FormInstance directly (toInstance is
 * identity) and the generic extractForm builds its schema.
 *
 * The rules are genuinely 1099-shaped, not stubs: TIN formats, non-negative
 * money, Box 4 backup withholding can't exceed Box 1 comp, and a withholding
 * plausibility check. No Social Security / Medicare math — it doesn't apply to
 * nonemployee compensation, which is the whole point of a separate definition.
 */

const TOLERANCE_USD = 2.0;

const blank: ExtractedField = { present: false, value: null, raw: null, source: null };
const num = (f: ExtractedField | undefined): number | null =>
  f == null || f.value == null ? null : typeof f.value === "number" ? f.value : Number(f.value);

export const nec1099Definition: FormDefinition<FormInstance> = {
  id: "1099-nec",
  name: "Form 1099-NEC",
  taxYears: [2000, LATEST_KNOWN_YEAR],

  schema: [
    { id: "payer_name", label: "Payer name", type: "text", group: "Payer" },
    { id: "payer_tin", label: "Payer TIN", type: "tin", group: "Payer", crossRead: true },
    { id: "recipient_name", label: "Recipient name", type: "text", group: "Recipient" },
    { id: "recipient_tin", label: "Recipient TIN", type: "tin", group: "Recipient", crossRead: true },
    { id: "taxYear", label: "Tax year", type: "year", group: "Form" },
    { id: "box1_nonemployeeComp", label: "Nonemployee compensation", box: "Box 1", type: "money", group: "Amounts", crossRead: true },
    { id: "box4_fedWithholding", label: "Federal income tax withheld", box: "Box 4", type: "money", group: "Amounts", crossRead: true },
    { id: "box5_stateTaxWithheld", label: "State tax withheld", box: "Box 5", type: "money", group: "State" },
    { id: "box6_stateNumber", label: "State/Payer's state no.", box: "Box 6", type: "text", group: "State" },
    { id: "box7_stateIncome", label: "State income", box: "Box 7", type: "money", group: "State" },
  ],

  rules: [
    { kind: "required", field: "payer_name", code: "MISSING_REQUIRED" },
    { kind: "required", field: "payer_tin", code: "MISSING_REQUIRED" },
    { kind: "required", field: "recipient_name", code: "MISSING_REQUIRED" },
    { kind: "required", field: "recipient_tin", code: "MISSING_REQUIRED" },
    { kind: "required", field: "box1_nonemployeeComp", code: "MISSING_REQUIRED" },

    { kind: "format", field: "payer_tin", format: "tin", code: "TIN_FORMAT" },
    { kind: "format", field: "recipient_tin", format: "tin", code: "TIN_FORMAT" },

    { kind: "nonNegative", field: "box1_nonemployeeComp", code: "NEGATIVE" },
    { kind: "nonNegative", field: "box4_fedWithholding", code: "NEGATIVE" },
    { kind: "nonNegative", field: "box5_stateTaxWithheld", code: "NEGATIVE" },
    { kind: "nonNegative", field: "box7_stateIncome", code: "NEGATIVE" },

    // Backup withholding (Box 4) can't exceed the compensation it's withheld from.
    { kind: "cannotExceed", field: "box4_fedWithholding", max: "box1_nonemployeeComp", code: "WITHHOLDING_GT_COMP", severity: "error" },
  ],

  // Flat form: the extracted instance IS the engine's instance.
  toInstance: (inst) => inst,
  taxYearField: (inst) => inst.fields.taxYear ?? blank,

  // No payroll constants — a 1099 has none. We still resolve the year for the
  // shared out-of-range / missing checks.
  resolveContext: (year) => {
    const exact = year != null;
    const resolvedYear = year ?? LATEST_KNOWN_YEAR;
    const ctx: ValidationContext = { constants: {}, resolvedYear, tolerance: TOLERANCE_USD };
    return { ctx, resolvedYear, exact };
  },

  /** Plausibility: backup withholding is a flat 24% when it applies, so a very
   *  high withholding ratio (that isn't an outright Box 4 > Box 1 error) is worth
   *  a look. Kept simple and honest — a real check, not a stub. */
  customValidate: (inst, ctx): Issue[] => {
    const out: Issue[] = [];
    const comp = num(inst.fields.box1_nonemployeeComp);
    const wh = num(inst.fields.box4_fedWithholding);
    if (comp != null && wh != null && comp > 0 && wh <= comp && wh / comp > 0.4) {
      out.push({
        field: "box4_fedWithholding",
        severity: "warning",
        code: "WITHHOLDING_HIGH",
        message: `Federal withholding is ${Math.round((wh / comp) * 100)}% of compensation — unusually high (backup withholding is 24%), confirm against the source.`,
      });
    }
    void ctx;
    return out;
  },

  outputMapping: {
    box1_nonemployeeComp: { target: "Schedule C line 1 — gross receipts (self-employment)", exportKey: "box1_nonemployeeCompensation" },
    box4_fedWithholding: { target: "1040 line 25b — federal tax withheld (1099s)", exportKey: "box4_federalWithholding" },
    box5_stateTaxWithheld: { target: "Schedule A — state tax withheld (if itemizing)", exportKey: "box5_stateTaxWithheld" },
  },
};
