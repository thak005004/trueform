import { test } from "node:test";
import assert from "node:assert/strict";
import { valuePresent, hasReadableSignal, shouldFlag } from "./cross-read.js";

// The comparison is PRESENCE-based: does the value appear in the (generous) region OCR?
// Found → agree (no flag). Absent but region readable → flag. No signal → no flag.

test("money: value present in region → agree; absent → flag; no signal → no flag", () => {
  // Generous crop picks up neighboring text too — presence still confirms.
  assert.equal(valuePresent("money", 78000, "1 Wages 78,000.00 2 Fed 9,360.00"), true);
  assert.equal(shouldFlag("money", 78000, "1 Wages 78,000.00 2 Fed 9,360.00"), false);

  // Region reads a different number where the value should be → couldn't confirm.
  assert.equal(valuePresent("money", 78000, "76,000.00"), false);
  assert.equal(shouldFlag("money", 78000, "76,000.00"), true);

  // No numbers read at all → no signal → don't cry wolf.
  assert.equal(hasReadableSignal("money", "~~ smudge ~~"), false);
  assert.equal(shouldFlag("money", 78000, "~~ smudge ~~"), false);

  // Substring safety: 78000 must not "match" inside 780000 or 178000.
  assert.equal(valuePresent("money", 78000, "780000 178000"), false);
});

test("id: SSN/EIN digits present in region → agree; different digits → flag", () => {
  assert.equal(valuePresent("id", "482-19-3756", "SSN 482 19 3756 employer"), true);
  assert.equal(shouldFlag("id", "482-19-3756", "SSN 482 19 3756 employer"), false);

  assert.equal(valuePresent("id", "482-19-3756", "482-19-3766"), false);
  assert.equal(shouldFlag("id", "482-19-3756", "482-19-3766"), true);

  // No digits read → no signal → no flag.
  assert.equal(shouldFlag("id", "482-19-3756", "social security number"), false);
});

test("text: fuzzy presence tolerates OCR slips (kept general, not currently scoped)", () => {
  assert.equal(valuePresent("text", "Marcus T. Halloran", "e Marcus T Halloran 88 Marigold Ln"), true);
  assert.equal(valuePresent("text", "Marcus T. Halloran", "1450 Cedar Hollow Rd Sacramento"), false);
});
