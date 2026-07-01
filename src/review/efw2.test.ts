import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEFW2, fieldMap } from "./efw2.js";
import type { W2 } from "@/lib/w2-schema";

const t = (v: unknown) => ({ present: v != null, value: v ?? null, raw: null, source: null });
const w2 = {
  taxYear: t(2025),
  employer: { name: t("Meridian Capital Partners"), ein: t("92-4471203"), address: t("") },
  employee: { name: t("Dana R. Okafor"), ssn: t("573-24-8891"), address: t("1820 Fillmore St") },
  controlNumber: t(""),
  box1_wages: t(250000),
  box2_fedWithholding: t(55000),
  box3_ssWages: t(176100),
  box4_ssTax: t(10918.2),
  box5_medicareWages: t(250000),
  box6_medicareTax: t(3625),
  box7_ssTips: t(null),
  box8_allocatedTips: t(null),
  box10_dependentCare: t(null),
  box11_nonqualifiedPlans: t(null),
  box12: [],
  box13: { statutoryEmployee: false, retirementPlan: false, thirdPartySickPay: false },
  box14_other: [],
  stateLocal: [
    { state: t("CA"), employerStateId: t("888-1122-4"), stateWages: t(250000), stateIncomeTax: t(22500), localWages: t(null), localIncomeTax: t(null), localityName: t(null) },
  ],
} as unknown as W2;

test("buildEFW2: emits an RW and one RS per state, each exactly 512 chars", () => {
  const lines = buildEFW2(w2).split("\r\n").filter(Boolean);
  assert.equal(lines.length, 2);
  assert.ok(lines.every((l) => l.length === 512));
  assert.ok(lines[0].startsWith("RW"));
  assert.ok(lines[1].startsWith("RS"));
});

test("buildEFW2: SSN and money land at their spec positions, cents-encoded", () => {
  const rw = buildEFW2(w2).split("\r\n")[0];
  // SSN at positions 3-11 (0-indexed slice 2..11), digits only
  assert.equal(rw.slice(2, 11), "573248891");
  // Box 1 wages at positions 188-198: $250,000.00 -> 25000000 cents, 11-wide zero-filled
  assert.equal(rw.slice(187, 198), "00025000000");
  // Box 4 with cents: $10,918.20 -> 1091820 cents
  assert.equal(rw.slice(220, 231), "00001091820");
});

test("buildEFW2: RS carries the FIPS state code and state wages", () => {
  const rs = buildEFW2(w2).split("\r\n")[1];
  assert.equal(rs.slice(2, 4), "06"); // CA FIPS
  assert.equal(rs.slice(275, 286), "00025000000"); // Box 16 state wages
});

test("buildEFW2: a multi-state W-2 produces one RS per state", () => {
  const multi = {
    ...w2,
    stateLocal: [
      { state: t("CA"), employerStateId: t("1"), stateWages: t(80000), stateIncomeTax: t(5600), localWages: t(null), localIncomeTax: t(null), localityName: t(null) },
      { state: t("NY"), employerStateId: t("2"), stateWages: t(50000), stateIncomeTax: t(3300), localWages: t(null), localIncomeTax: t(null), localityName: t(null) },
    ],
  } as unknown as W2;
  const lines = buildEFW2(multi).split("\r\n").filter(Boolean);
  assert.equal(lines.length, 3); // RW + 2x RS
  assert.equal(lines[2].slice(2, 4), "36"); // NY FIPS
});

test("fieldMap: box 1 maps to the 1040 wage line", () => {
  const rows = fieldMap(w2);
  const box1 = rows.find((r) => r.box === "1");
  assert.match(box1?.mapsTo ?? "", /1040/);
  assert.equal(box1?.value, "$250,000.00");
});
