import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestedFix } from "./suggestions.js";
import type { Issue } from "@/lib/validation";

const iss = (code: string, message: string): Issue => ({ field: "x", severity: "error", code, message });

test("suggestedFix: parses the expected value out of a Box 4 mismatch message", () => {
  const fix = suggestedFix([
    iss("SS_TAX_MISMATCH", "Box 4 should be ~6.2% of Box 3+7. Expected ~$5,208, found $2,508 (off by $2,700)."),
  ]);
  assert.ok(fix);
  assert.equal(fix.value, 5208);
  assert.equal(fix.display, "$5,208.00");
});

test("suggestedFix: handles a Medicare mismatch with decimals", () => {
  const fix = suggestedFix([
    iss("MEDICARE_TAX_MISMATCH", "Box 6 should be ~1.45% of Box 5. Expected ~$1,377.50, found $1,300."),
  ]);
  assert.equal(fix?.value, 1377.5);
});

test("suggestedFix: no fix for non-math issues or when there are none", () => {
  assert.equal(suggestedFix([iss("NEGATIVE", "box is negative")]), null);
  assert.equal(suggestedFix([]), null);
});
