import { test } from "node:test";
import assert from "node:assert/strict";
import { box12Label } from "./box12-codes.js";

test("box12Label: decodes known codes, case-insensitive", () => {
  assert.equal(box12Label("D"), "401(k) elective deferral");
  assert.equal(box12Label("aa"), "Roth 401(k) contribution");
  assert.equal(box12Label("DD"), "Cost of employer-sponsored health coverage");
  assert.equal(box12Label("W"), "Employer + employee HSA contributions");
});

test("box12Label: null for unknown or blank codes", () => {
  assert.equal(box12Label("ZZ"), null);
  assert.equal(box12Label(null), null);
  assert.equal(box12Label(undefined), null);
  assert.equal(box12Label(""), null);
});
