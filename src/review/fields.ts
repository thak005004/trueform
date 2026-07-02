import type { W2, SourceRef } from "@/lib/w2-schema";
import { box12Label } from "@/review/box12-codes";

/**
 * Presentation config for the review pane: which W-2 fields to show, how to label
 * them, and how to format them. Paths match the dot-paths validateW2 uses for
 * byField, so a field row can look up its own validation status directly.
 */

export type FieldKind = "money" | "text" | "id" | "year";

export interface FieldDef {
  /** dot-path to the field OBJECT ({present,value,raw,source}) inside the W2 */
  path: string;
  label: string;
  /** mono eyebrow, e.g. "Box 1" or the lettered boxes "Box a" */
  box?: string;
  kind: FieldKind;
}

export interface FieldGroup {
  title: string;
  fields: FieldDef[];
}

/** Money, IDs, and the year render in mono (.figure); names/addresses in sans. */
export function isMono(kind: FieldKind): boolean {
  return kind !== "text";
}

export type Bbox = NonNullable<SourceRef["bbox"]>;
type FieldObj = { present: boolean; value: unknown; raw: string | null; source: SourceRef | null };

// --- generic path get/set ------------------------------------------------
export function getByPath(obj: unknown, path: string): FieldObj {
  return path.split(".").reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), obj) as FieldObj;
}

// --- formatting ----------------------------------------------------------
const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/** Display string for a committed value. Em dash for blank/unreadable. */
export function formatValue(field: FieldObj, kind: FieldKind): string {
  const v = field?.value;
  if (v == null || v === "") return "-";
  if (kind === "money" && typeof v === "number") return usd(v);
  return String(v);
}

/** Initial text shown in the edit input. */
export function editInitial(field: FieldObj): string {
  return field?.value == null ? "" : String(field.value);
}

/** Short value string for the audit log. */
export function auditValue(field: FieldObj, kind: FieldKind): string {
  const v = field?.value;
  if (v == null || v === "") return "(blank)";
  if (kind === "money" && typeof v === "number") return usd(v);
  return String(v);
}

export interface ParsedInput {
  present: boolean;
  value: number | string | null;
  raw: string | null;
}

/** Turn raw input text into the {present,value,raw} a W-2 field expects. */
export function parseInput(rawInput: string, kind: FieldKind): ParsedInput {
  const trimmed = rawInput.trim();
  if (trimmed === "") return { present: false, value: null, raw: null };

  if (kind === "money") {
    const n = Number(trimmed.replace(/[$,\s]/g, ""));
    // Keep the typed text as raw even if it doesn't parse, so nothing is lost.
    return { present: true, value: Number.isNaN(n) ? null : n, raw: trimmed };
  }
  if (kind === "year") {
    const n = parseInt(trimmed, 10);
    return { present: true, value: Number.isNaN(n) ? null : n, raw: trimmed };
  }
  // text / id
  return { present: true, value: trimmed, raw: trimmed };
}

// --- group assembly ------------------------------------------------------
const STATIC_GROUPS: FieldGroup[] = [
  {
    title: "Employee",
    fields: [
      { path: "employee.name", label: "Employee name", box: "Box e", kind: "text" },
      { path: "employee.ssn", label: "Social Security number", box: "Box a", kind: "id" },
      { path: "employee.address", label: "Address", kind: "text" },
    ],
  },
  {
    title: "Employer",
    fields: [
      { path: "employer.name", label: "Employer name", box: "Box c", kind: "text" },
      { path: "employer.ein", label: "EIN", box: "Box b", kind: "id" },
      { path: "employer.address", label: "Address", kind: "text" },
      { path: "controlNumber", label: "Control number", box: "Box d", kind: "text" },
    ],
  },
  {
    title: "Federal",
    fields: [
      { path: "taxYear", label: "Tax year", kind: "year" },
      { path: "box1_wages", label: "Wages, tips, other comp.", box: "Box 1", kind: "money" },
      { path: "box2_fedWithholding", label: "Federal income tax withheld", box: "Box 2", kind: "money" },
      { path: "box3_ssWages", label: "Social Security wages", box: "Box 3", kind: "money" },
      { path: "box4_ssTax", label: "Social Security tax withheld", box: "Box 4", kind: "money" },
      { path: "box5_medicareWages", label: "Medicare wages and tips", box: "Box 5", kind: "money" },
      { path: "box6_medicareTax", label: "Medicare tax withheld", box: "Box 6", kind: "money" },
      { path: "box7_ssTips", label: "Social Security tips", box: "Box 7", kind: "money" },
      { path: "box8_allocatedTips", label: "Allocated tips", box: "Box 8", kind: "money" },
      { path: "box10_dependentCare", label: "Dependent care benefits", box: "Box 10", kind: "money" },
      { path: "box11_nonqualifiedPlans", label: "Nonqualified plans", box: "Box 11", kind: "money" },
    ],
  },
];

/**
 * Build the full group list for a given W-2. Box 12 and State/Local are dynamic
 * (one row per entry present on the form). For Box 12 we make the amount the
 * editable value and surface its code in the label — editing codes is rare and
 * out of scope for this pass.
 */
export function buildGroups(w2: W2): FieldGroup[] {
  const groups = [...STATIC_GROUPS];

  if (w2.box12?.length) {
    groups.push({
      title: "Box 12",
      fields: w2.box12.map((e, i) => ({
        path: `box12.${i}.amount`,
        label: box12Label(e.code.value) ?? `Code ${e.code.value ?? "-"}`,
        box: e.code.value ? `Box 12 · ${e.code.value}` : "Box 12",
        kind: "money" as const,
      })),
    });
  }

  w2.stateLocal?.forEach((_, i) => {
    const multi = w2.stateLocal.length > 1;
    groups.push({
      title: multi ? `State / Local ${i + 1}` : "State / Local",
      fields: [
        { path: `stateLocal.${i}.state`, label: "State", box: "Box 15", kind: "text" },
        { path: `stateLocal.${i}.employerStateId`, label: "Employer state ID", box: "Box 15", kind: "text" },
        { path: `stateLocal.${i}.stateWages`, label: "State wages", box: "Box 16", kind: "money" },
        { path: `stateLocal.${i}.stateIncomeTax`, label: "State income tax", box: "Box 17", kind: "money" },
        { path: `stateLocal.${i}.localWages`, label: "Local wages", box: "Box 18", kind: "money" },
        { path: `stateLocal.${i}.localIncomeTax`, label: "Local income tax", box: "Box 19", kind: "money" },
        { path: `stateLocal.${i}.localityName`, label: "Locality name", box: "Box 20", kind: "text" },
      ],
    });
  });

  return groups;
}
