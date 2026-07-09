import { round2 } from "@/lib/tax-constants";
import type {
  ExtractedField,
  FormDefinition,
  FormInstance,
  Issue,
  Rule,
  ValidationContext,
  ValidationResult,
} from "./types";

/**
 * THE FORM-AGNOSTIC ENGINE.
 * -------------------------
 * `runValidation(raw, def)` runs ANY form through the same pipeline: resolve the
 * tax year, interpret the declarative rules, then call the form's customValidate
 * escape hatch. It has zero W-2 knowledge — everything form-specific comes from
 * the definition. Add a form = add a definition; this file never changes.
 *
 * Trust thesis preserved: every Issue still comes from arithmetic/format/reconc-
 * iliation the form must satisfy, never from the model's opinion of itself.
 */

// --- value helpers -------------------------------------------------------
function numOf(inst: FormInstance, id: string): number | null {
  const v = inst.fields[id]?.value;
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isNaN(n) ? null : n;
}
/** Sum of a field list, treating absent/blank as 0 (matches payroll math where an empty box means $0). */
function sumOf(inst: FormInstance, ids: string[]): number {
  return ids.reduce((s, id) => s + (numOf(inst, id) ?? 0), 0);
}

// --- the rule interpreter ------------------------------------------------
function runRule(rule: Rule, inst: FormInstance, ctx: ValidationContext): Issue[] {
  const out: Issue[] = [];
  const tol = ctx.tolerance;

  switch (rule.kind) {
    case "required": {
      const f = inst.fields[rule.field];
      if (!f || !f.present || f.value == null || f.value === "") {
        out.push({ field: rule.field, severity: "warning", code: rule.code, message: "Required field is missing or unreadable — needs review." });
      }
      break;
    }
    case "nonNegative": {
      const v = numOf(inst, rule.field);
      if (v != null && v < 0)
        out.push({ field: rule.field, severity: "error", code: rule.code, message: `${rule.field} is negative, which is not valid on this form.` });
      break;
    }
    case "format": {
      const raw = inst.fields[rule.field]?.value;
      if (raw == null || raw === "") break;
      const s = String(raw);
      if (rule.format === "ein" || rule.format === "tin") {
        const digits = s.replace(/\D/g, "");
        if (digits.length !== 9)
          out.push({ field: rule.field, severity: "warning", code: rule.code, message: `"${s}" doesn't contain 9 digits (NN-NNNNNNN).` });
      } else if (rule.format === "ssn") {
        const ssn = s.replace(/-/g, "").trim();
        if (!/^\d{9}$/.test(ssn)) {
          out.push({ field: rule.field, severity: "warning", code: rule.code, message: `"${s}" isn't in NNN-NN-NNNN form.` });
        } else {
          const area = ssn.slice(0, 3);
          if ((area === "000" || area === "666" || Number(area) >= 900) && rule.rangeCode)
            out.push({ field: rule.field, severity: "warning", code: rule.rangeCode, message: `SSN area "${area}" is never validly issued.` });
        }
      }
      break;
    }
    case "cannotExceed": {
      const left = rule.fields ? sumOf(inst, rule.fields) : rule.field ? numOf(inst, rule.field) : null;
      const right = rule.maxFromCtx != null ? ctx.constants[rule.maxFromCtx] : rule.max != null ? numOf(inst, rule.max) : null;
      if (left == null || right == null) break;
      if (left > right + tol) {
        const anchor = rule.field ?? rule.fields?.[0] ?? "";
        const rightLabel = rule.maxFromCtx ? `$${right.toLocaleString()}` : `$${right.toLocaleString()}`;
        out.push({
          field: anchor,
          severity: rule.severity ?? "error",
          code: rule.code,
          message: `${anchor} ($${round2(left).toLocaleString()}) exceeds the allowed maximum (${rightLabel}).`,
        });
      }
      break;
    }
    case "percentageOf": {
      const val = numOf(inst, rule.field);
      if (val == null) break;
      const base0 = sumOf(inst, rule.of);
      const base = rule.capFromCtx != null ? Math.min(base0, ctx.constants[rule.capFromCtx]) : base0;
      const expected = round2(base * rule.pct);
      const max = rule.maxFromCtx != null ? ctx.constants[rule.maxFromCtx] : null;
      if (max != null && val > max + tol && rule.overMaxCode) {
        out.push({ field: rule.field, severity: "error", code: rule.overMaxCode, message: `${rule.field} ($${val.toLocaleString()}) exceeds the annual maximum of $${max.toLocaleString()}.` });
      } else if (Math.abs(val - expected) > tol) {
        out.push({
          field: rule.field,
          severity: "error",
          code: rule.mismatchCode,
          message: `${rule.field} should be ~${(rule.pct * 100).toFixed(2)}% of the base. Expected ~$${expected.toLocaleString()}, found $${val.toLocaleString()} (off by $${round2(Math.abs(val - expected)).toLocaleString()}).`,
        });
      }
      break;
    }
    case "sumEquals": {
      const lhs = sumOf(inst, rule.fields);
      const rhs = numOf(inst, rule.equals);
      if (rhs == null) break;
      if (Math.abs(lhs - rhs) > tol)
        out.push({ field: rule.equals, severity: rule.severity ?? "warning", code: rule.code, message: `Sum of ${rule.fields.join(" + ")} = $${round2(lhs).toLocaleString()} doesn't match ${rule.equals} ($${rhs.toLocaleString()}).` });
      break;
    }
  }
  return out;
}

// --- shared tax-year checks (every form has a year) ----------------------
function taxYearIssues(field: ExtractedField, range: [number, number], resolvedYear: number, exact: boolean): Issue[] {
  if (!field.present || field.value == null) {
    return [{ field: "taxYear", severity: "warning", code: "TAX_YEAR_MISSING", message: `Tax year not found. Validation used ${resolvedYear} constants as a fallback — confirm the year.` }];
  }
  const y = Number(field.value);
  if (y < range[0] || y > range[1] + 1) {
    return [{ field: "taxYear", severity: "warning", code: "TAX_YEAR_RANGE", message: `Tax year ${y} looks out of range.` }];
  }
  if (!exact) {
    return [{ field: "taxYear", severity: "info", code: "TAX_YEAR_FALLBACK", message: `No constants on file for ${y}; used ${resolvedYear}.` }];
  }
  return [];
}

// --- assemble the result -------------------------------------------------
function deriveResult(issues: Issue[], resolvedYear: number, taxYearExact: boolean): ValidationResult {
  const byField: Record<string, ValidationResult["byField"][string]> = {};
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
  return { issues, byField, summary, resolvedTaxYear: resolvedYear, taxYearExact };
}

/** Validate any form through its definition. The one entry point the engine exposes. */
export function runValidation<Raw>(raw: Raw, def: FormDefinition<Raw>): ValidationResult {
  const yearField = def.taxYearField(raw);
  const yearValue = yearField.value == null ? null : Number(yearField.value);
  const { ctx, resolvedYear, exact } = def.resolveContext(yearValue);
  const inst = def.toInstance(raw);

  const issues: Issue[] = [
    ...taxYearIssues(yearField, def.taxYears, resolvedYear, exact),
    ...def.rules.flatMap((r) => runRule(r, inst, ctx)),
    ...(def.customValidate?.(raw, ctx) ?? []),
  ];

  return deriveResult(issues, resolvedYear, exact);
}
