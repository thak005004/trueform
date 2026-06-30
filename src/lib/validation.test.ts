import { test } from "node:test";
import assert from "node:assert/strict";
import { validateW2 } from "./validation.js";
import type { W2 } from "./w2-schema.js";

// --- tiny builders to keep fixtures readable -------------------------------
const money = (v: number | null) => ({ present: v != null, value: v, raw: v?.toString() ?? null, source: null });
const text = (v: string | null) => ({ present: v != null, value: v, raw: v, source: null });

function baseW2(over: Partial<W2> = {}): W2 {
  const w: W2 = {
    taxYear: { present: true, value: 2025, raw: "2025", source: null },
    employer: { name: text("Acme Corp"), ein: text("12-3456789"), address: text("1 Main St") },
    employee: { name: text("Jane Doe"), ssn: text("123-45-6789"), address: text("2 Oak Ave") },
    controlNumber: text(null),
    box1_wages: money(60000),
    box2_fedWithholding: money(7200),
    box3_ssWages: money(60000),
    box4_ssTax: money(3720), // 6.2% of 60000
    box5_medicareWages: money(60000),
    box6_medicareTax: money(870), // 1.45% of 60000
    box7_ssTips: money(null),
    box8_allocatedTips: money(null),
    box10_dependentCare: money(null),
    box11_nonqualifiedPlans: money(null),
    box12: [],
    box13: { statutoryEmployee: false, retirementPlan: false, thirdPartySickPay: false },
    box14_other: [],
    stateLocal: [],
  };
  return { ...w, ...over };
}

test("clean W-2 produces no errors or warnings", () => {
  const r = validateW2(baseW2());
  assert.equal(r.summary.errors, 0, JSON.stringify(r.issues, null, 2));
  assert.equal(r.summary.warnings, 0, JSON.stringify(r.issues, null, 2));
});

test("high earner correctly capped at the 2025 wage base passes", () => {
  // SS wages capped at 176,100; Box 4 = 6.2% * 176,100 = 10,918.20
  const r = validateW2(
    baseW2({
      box1_wages: money(250000),
      box3_ssWages: money(176100),
      box4_ssTax: money(10918.2),
      box5_medicareWages: money(250000),
      box6_medicareTax: money(4075), // 1.45%*250k + 0.9%*(250k-200k) = 3625 + 450
      box2_fedWithholding: money(40000),
    }),
  );
  assert.equal(r.summary.errors, 0, JSON.stringify(r.issues, null, 2));
});

test("SS wages over the cap is a hard error", () => {
  const r = validateW2(baseW2({ box3_ssWages: money(200000), box4_ssTax: money(10918.2) }));
  assert.ok(r.issues.some((i) => i.code === "SS_CAP_EXCEEDED" && i.severity === "error"));
});

test("transposed digit in Box 4 is caught by the 6.2% check", () => {
  // 6.2% of 60000 = 3720; a transposition to 3270 should be flagged
  const r = validateW2(baseW2({ box4_ssTax: money(3270) }));
  assert.ok(r.issues.some((i) => i.code === "SS_TAX_MISMATCH" && i.severity === "error"));
});

test("missing Additional Medicare for a >$200k earner is caught", () => {
  // Box 5 = 250k but Box 6 only has the flat 1.45% (3625), missing the 0.9% surtax
  const r = validateW2(
    baseW2({
      box1_wages: money(250000),
      box3_ssWages: money(176100),
      box4_ssTax: money(10918.2),
      box5_medicareWages: money(250000),
      box6_medicareTax: money(3625), // should be 4075
      box2_fedWithholding: money(40000),
    }),
  );
  assert.ok(r.issues.some((i) => i.code === "MEDICARE_TAX_MISMATCH"));
});

test("401(k) deferral: Box1 < Box5 does NOT error, and reconciles", () => {
  // Box 5 = 60k, Box 1 = 51k, $9k in Box 12 code D — legit, must not be flagged as an error
  const r = validateW2(
    baseW2({
      box1_wages: money(51000),
      box4_ssTax: money(3720), // SS still on 60k
      box6_medicareTax: money(870),
      box12: [{ code: text("D"), amount: money(9000) }],
    }),
  );
  assert.equal(r.summary.errors, 0, JSON.stringify(r.issues, null, 2));
  assert.equal(r.summary.warnings, 0, JSON.stringify(r.issues, null, 2));
  assert.ok(r.issues.some((i) => i.code === "DEFERRAL_RECONCILES"));
});

test("malformed SSN and EIN are flagged as review, not errors", () => {
  const r = validateW2(
    baseW2({
      employer: { name: text("Acme"), ein: text("12-345"), address: text(null) },
      employee: { name: text("Jane"), ssn: text("000-12-3456"), address: text(null) },
    }),
  );
  assert.ok(r.issues.some((i) => i.code === "EIN_FORMAT" && i.severity === "warning"));
  assert.ok(r.issues.some((i) => i.code === "SSN_INVALID_RANGE" && i.severity === "warning"));
});

test("withholding greater than wages is impossible -> error", () => {
  const r = validateW2(baseW2({ box2_fedWithholding: money(70000) }));
  assert.ok(r.issues.some((i) => i.code === "WITHHOLDING_GT_WAGES" && i.severity === "error"));
});

test("missing tax year falls back and warns", () => {
  const r = validateW2(baseW2({ taxYear: { present: false, value: null, raw: null, source: null } }));
  assert.ok(r.issues.some((i) => i.code === "TAX_YEAR_MISSING"));
  assert.equal(r.taxYearExact, false);
});

test("per-field status is derived correctly", () => {
  const r = validateW2(baseW2({ box4_ssTax: money(3270) }));
  assert.equal(r.byField["box4_ssTax"].status, "error");
});
