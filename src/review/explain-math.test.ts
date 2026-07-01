import { test } from "node:test";
import assert from "node:assert/strict";
import { explainMath } from "./explain-math.js";
import type { Issue } from "@/lib/validation";
import type { W2 } from "@/lib/w2-schema";

const iss = (code: string): Issue => ({ field: "x", severity: "error", code, message: "" });
const tf = (v: unknown) => ({ present: v != null, value: v ?? null, raw: null, source: null });
const w2 = (o: { box3?: number; box5?: number }) =>
  ({
    taxYear: tf(2025),
    box3_ssWages: tf(o.box3 ?? 0),
    box7_ssTips: tf(0),
    box5_medicareWages: tf(o.box5 ?? 0),
  }) as unknown as W2;

test("explainMath: SS tax formula with the numbers plugged in", () => {
  const s = explainMath([iss("SS_TAX_MISMATCH")], w2({ box3: 84000 }));
  assert.match(s ?? "", /6\.2% × \$84,000\.00.*=.*\$5,208\.00/);
});

test("explainMath: Medicare formula shows the +0.9% surtax for a >$200k earner", () => {
  const s = explainMath([iss("MEDICARE_TAX_MISMATCH")], w2({ box5: 250000 }));
  assert.match(s ?? "", /1\.45% × \$250,000\.00.*0\.9%.*over \$200k/);
});

test("explainMath: null when no math-mismatch code is present", () => {
  assert.equal(explainMath([iss("SSN_FORMAT")], w2({})), null);
});
