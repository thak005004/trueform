import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcilePacket, type ReconcileDocInput } from "./reconcile.js";
import type { W2 } from "@/lib/w2-schema";

// Minimal doc builder — reconcile only reads SSN/name/address + boxes 1 & 2,
// so we construct just those fields and cast to W2.
function doc(
  id: string,
  o: { ssn?: string | null; name?: string | null; address?: string | null; box1?: number | null; box2?: number | null },
): ReconcileDocInput {
  const tf = (value: unknown) => ({ present: value != null, value: value ?? null, raw: null, source: null });
  const w2 = {
    employee: { ssn: tf(o.ssn), name: tf(o.name), address: tf(o.address) },
    box1_wages: tf(o.box1),
    box2_fedWithholding: tf(o.box2),
  } as unknown as W2;
  return { id, w2 };
}

test("same SSN with different names flags an error", () => {
  const r = reconcilePacket([
    doc("a", { ssn: "111-22-3333", name: "Marcus Halloran", box1: 50000 }),
    doc("b", { ssn: "111223333", name: "Priya Nair", box1: 20000 }),
  ]);
  const iss = r.crossDocIssues.find((i) => i.code === "SSN_NAME_MISMATCH");
  assert.ok(iss, "expected SSN_NAME_MISMATCH to fire");
  assert.equal(iss.severity, "error");
  assert.deepEqual([...iss.docIds].sort(), ["a", "b"]);
});

test("different SSNs in one packet flags a wrong-client warning", () => {
  const r = reconcilePacket([
    doc("a", { ssn: "111-22-3333", name: "Marcus Halloran" }),
    doc("b", { ssn: "999-88-7777", name: "Marcus Halloran" }),
  ]);
  const iss = r.crossDocIssues.find((i) => i.code === "PACKET_MULTIPLE_SSNS");
  assert.ok(iss, "expected PACKET_MULTIPLE_SSNS to fire");
  assert.equal(iss.severity, "warning");
});

test("consistent packet has no cross-doc issues and rolls up totals", () => {
  const r = reconcilePacket([
    doc("a", { ssn: "111-22-3333", name: "Marcus Halloran", address: "88 Marigold Ln", box1: 78000, box2: 9360 }),
    // Same person (case/spacing differ but normalize equal), second employer.
    doc("b", { ssn: "111223333", name: "MARCUS  HALLORAN", address: "88 marigold ln", box1: 12000, box2: 1500 }),
  ]);
  assert.equal(r.crossDocIssues.length, 0);
  assert.equal(r.aggregates.documentCount, 2);
  assert.equal(r.aggregates.totalBox1Wages, 90000);
  assert.equal(r.aggregates.totalBox2Withholding, 10860);
});
