import { test } from "node:test";
import assert from "node:assert/strict";
import { runValidation } from "./engine";
import { nec1099Definition } from "./1099nec";
import type { ExtractedField, FormInstance } from "./types";

/**
 * Proves the SAME engine validates a second, unrelated form — with no engine
 * changes, only a definition. If these pass alongside the W-2 suite, the
 * form-agnostic claim holds.
 */

const money = (v: number | null): ExtractedField => ({ present: v != null, value: v, raw: v?.toString() ?? null, source: null });
const text = (v: string | null): ExtractedField => ({ present: v != null, value: v, raw: v, source: null });

function base(over: Record<string, ExtractedField> = {}): FormInstance {
  return {
    formType: "1099-nec",
    fields: {
      payer_name: text("Acme LLC"),
      payer_tin: text("12-3456789"),
      recipient_name: text("Jane Doe"),
      recipient_tin: text("123-45-6789"),
      taxYear: { present: true, value: 2025, raw: "2025", source: null },
      box1_nonemployeeComp: money(20000),
      box4_fedWithholding: money(null), // no backup withholding on a clean form
      box5_stateTaxWithheld: money(null),
      box6_stateNumber: text(null),
      box7_stateIncome: money(null),
      ...over,
    },
  };
}

test("clean 1099-NEC produces no errors or warnings", () => {
  const r = runValidation(base(), nec1099Definition);
  assert.equal(r.summary.errors, 0, JSON.stringify(r.issues, null, 2));
  assert.equal(r.summary.warnings, 0, JSON.stringify(r.issues, null, 2));
});

test("Box 4 withholding exceeding Box 1 comp is a hard error", () => {
  const r = runValidation(base({ box4_fedWithholding: money(25000) }), nec1099Definition);
  assert.ok(r.issues.some((i) => i.code === "WITHHOLDING_GT_COMP" && i.severity === "error"));
});

test("malformed recipient TIN is flagged as review, not error", () => {
  const r = runValidation(base({ recipient_tin: text("123") }), nec1099Definition);
  assert.ok(r.issues.some((i) => i.code === "TIN_FORMAT" && i.severity === "warning"));
});

test("negative compensation is an error", () => {
  const r = runValidation(base({ box1_nonemployeeComp: money(-100) }), nec1099Definition);
  assert.ok(r.issues.some((i) => i.code === "NEGATIVE" && i.severity === "error"));
});

test("missing required payer name warns", () => {
  const r = runValidation(base({ payer_name: text(null) }), nec1099Definition);
  assert.ok(r.issues.some((i) => i.code === "MISSING_REQUIRED" && i.severity === "warning"));
});

test("implausibly high withholding is a soft review", () => {
  const r = runValidation(base({ box4_fedWithholding: money(10000) }), nec1099Definition);
  assert.ok(r.issues.some((i) => i.code === "WITHHOLDING_HIGH" && i.severity === "warning"));
  assert.equal(r.summary.errors, 0);
});
