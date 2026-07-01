import { test } from "node:test";
import assert from "node:assert/strict";
import { docCurrentW2, docSummary, reconcileInputs } from "./packet-helpers.js";
import type { PacketDocument } from "@/state/document-context";
import type { W2, W2Extraction } from "@/lib/w2-schema";
import type { ValidationResult } from "@/lib/validation";

const doc = (o: Partial<PacketDocument>): PacketDocument =>
  ({
    id: "d1",
    fileName: "x.pdf",
    pages: [],
    status: "ready",
    error: null,
    extractStatus: "done",
    extractError: null,
    extractionVersion: 1,
    extraction: null,
    validation: null,
    draft: null,
    original: null,
    confirmed: [],
    audit: [],
    ...o,
  }) as PacketDocument;

const w2Stub = { box1_wages: { value: 1 } } as unknown as W2;

test("docCurrentW2: prefers draft, then extraction.w2, else null", () => {
  assert.equal(docCurrentW2(doc({ draft: w2Stub })), w2Stub);
  assert.equal(docCurrentW2(doc({ extraction: { documentType: "W-2", w2: w2Stub } as W2Extraction })), w2Stub);
  assert.equal(docCurrentW2(doc({})), null);
});

test("docSummary: reflects the extraction lifecycle and triage counts", () => {
  assert.equal(docSummary(doc({ extractStatus: "extracting" })).kind, "extracting");
  assert.equal(docSummary(doc({ extractStatus: "error" })).kind, "failed");
  assert.equal(docSummary(doc({ validation: null })).kind, "pending");

  const validation = {
    byField: {
      box4_ssTax: { status: "error", issues: [] },
      "employer.ein": { status: "review", issues: [] },
    },
  } as unknown as ValidationResult;
  const s = docSummary(doc({ validation, confirmed: [] }));
  assert.equal(s.kind, "done");
  if (s.kind === "done") {
    assert.equal(s.errors, 1);
    assert.equal(s.reviews, 1);
    assert.equal(s.ready, false);
  }
});

test("reconcileInputs: only extracted docs, keyed by id, using current W-2", () => {
  const inputs = reconcileInputs([doc({ id: "a", draft: w2Stub }), doc({ id: "b" })]);
  assert.equal(inputs.length, 1);
  assert.equal(inputs[0].id, "a");
});
