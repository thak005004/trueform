import type { SourceRef } from "@/lib/w2-schema";

/**
 * FORMS AS DATA — the core abstraction.
 * -------------------------------------
 * A tax form is a DECLARATIVE DEFINITION the engine reads at runtime, not code.
 * Every form (W-2, 1099-NEC, 1098, K-1, …) describes itself in the same four
 * parts — identity, schema, validationRules, outputMapping — so the pipeline
 * (extract → validate → cross-read → review → export) is form-agnostic. Adding a
 * form is adding a definition; the engine never changes.
 *
 * This file is the shared vocabulary. `engine.ts` interprets it; `w2.ts` /
 * `1099nec.ts` are instances of it.
 */

export type FieldType = "money" | "ssn" | "ein" | "tin" | "text" | "date" | "year";

/** One extracted value plus its grounding — the atom every field reduces to. */
export interface ExtractedField {
  present: boolean;
  value: number | string | null;
  raw: string | null;
  source: SourceRef | null;
}

/** A field/box the form declares: what it is, where it shows, whether it's cross-read. */
export interface FieldDef {
  /** Stable id; also the validation field path and the review row key. */
  id: string;
  label: string;
  /** Mono eyebrow, e.g. "Box 1". */
  box?: string;
  type: FieldType;
  /** Display grouping in the review pane, e.g. "Federal" or "Payer". */
  group: string;
  /** High-value field worth an independent second read. */
  crossRead?: boolean;
}

// --- validation output (kept identical to the pre-refactor shape) ----------
export type Severity = "error" | "warning" | "info";
export interface Issue {
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
 * A form instance the engine validates: a FLAT map of fieldId → extracted value.
 * Nested/rich forms (W-2) provide a `toInstance` adapter that flattens into this;
 * generically-extracted forms (1099) already are this shape.
 */
export interface FormInstance {
  formType: string;
  fields: Record<string, ExtractedField>;
}

// --- the rule DSL: common checks as CONFIG, not code -----------------------
export type FormatKind = "ein" | "ssn" | "tin";

/**
 * Declarative validation primitives. Most tax-form checks fit a handful of
 * these; a form's rules are then mostly a list of them as data. Genuinely custom
 * logic drops into `customValidate` (see FormDefinition) — the escape hatch.
 */
export type Rule =
  /** field must be present and non-empty */
  | { kind: "required"; field: string; code: string }
  /** money field must be >= 0 */
  | { kind: "nonNegative"; field: string; code: string }
  /** field must match a known identifier format (emits `code`, or `rangeCode` for a valid-shape-but-impossible id) */
  | { kind: "format"; field: string; format: FormatKind; code: string; rangeCode?: string }
  /** field (or the sum of `fields`) must be <= a field value or a context constant */
  | {
      kind: "cannotExceed";
      field?: string;
      fields?: string[];
      max?: string; // another field id
      maxFromCtx?: string; // a constants key
      code: string;
      severity?: Severity;
    }
  /** field should ≈ pct × sum(of), optionally capped; emits a mismatch (and an over-max) */
  | {
      kind: "percentageOf";
      field: string;
      of: string[];
      pct: number;
      capFromCtx?: string;
      maxFromCtx?: string;
      mismatchCode: string;
      overMaxCode?: string;
    }
  /** sum(fields) should ≈ `equals` */
  | { kind: "sumEquals"; fields: string[]; equals: string; code: string; severity?: Severity };

/** Runtime context handed to rules + customValidate (year constants, tolerance). */
export interface ValidationContext {
  constants: Record<string, number>;
  resolvedYear: number;
  tolerance: number;
}

/** Where a field goes downstream (the "into tax software" mapping). */
export interface OutputTarget {
  /** e.g. "1040 line 1a", or a schedule reference. */
  target: string;
  /** Stable export key (box-keyed) other software maps from. */
  exportKey: string;
}

/**
 * The whole form, as data. Generic over the raw extracted shape `Raw` so W-2 can
 * keep its rich nested object while 1099 uses the flat FormInstance directly.
 */
export interface FormDefinition<Raw = FormInstance> {
  id: string;
  name: string;
  /** Inclusive tax-year range this definition's rules/constants apply to. */
  taxYears: [number, number];
  schema: FieldDef[];
  rules: Rule[];
  /** Flatten the raw extraction into the engine's field map. Identity for flat forms. */
  toInstance: (raw: Raw) => FormInstance;
  /** The form's tax-year field, for the shared year-resolution checks. */
  taxYearField: (raw: Raw) => ExtractedField;
  /** Resolve year → constants + tolerance. W-2 uses payroll constants; simpler forms return a bare context. */
  resolveContext: (taxYear: number | null) => { ctx: ValidationContext; resolvedYear: number; exact: boolean };
  /** Escape hatch for logic that doesn't fit a primitive (e.g. W-2's deferral reconciliation). */
  customValidate?: (raw: Raw, ctx: ValidationContext) => Issue[];
  outputMapping: Record<string, OutputTarget>;
}
