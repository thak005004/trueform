import { test } from "node:test";
import assert from "node:assert/strict";
import { disagree } from "./cross-read.js";

test("money: transposed digits disagree, formatting noise does not", () => {
  assert.equal(disagree("money", 52000, "52,800.00"), true);
  assert.equal(disagree("money", 52000, "$52,000"), false);
  assert.equal(disagree("money", 52000, "garbled~~"), false); // unparseable → can't verify, no flag
});

test("id: differing SSN digits disagree; a misfired-length read does not", () => {
  assert.equal(disagree("id", "482-19-3756", "482 19 3756"), false); // same digits, spacing
  assert.equal(disagree("id", "482-19-3756", "482-19-3766"), true); // one digit off
  assert.equal(disagree("id", "482-19-3756", "48"), false); // OCR misfired → no flag
});

test("text: small OCR slips tolerated, a real name mismatch flags", () => {
  assert.equal(disagree("text", "Marcus T. Halloran", "MARCUS T HALLORAN"), false);
  assert.equal(disagree("text", "Marcus T. Halloran", "Marcus T. Hallcran"), false); // 1 slip
  assert.equal(disagree("text", "Marcus T. Halloran", "Priya Nair"), true);
});
