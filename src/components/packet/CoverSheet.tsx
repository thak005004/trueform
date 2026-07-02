"use client";

import { usePacket } from "@/state/document-context";
import { reconcilePacket, yearOverYear } from "@/review/reconcile";
import { docCurrentW2, docSummary, reconcileInputs } from "@/review/packet-helpers";

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/**
 * A print-only client summary — a real preparer deliverable. Hidden on screen
 * (`print:block`), so hitting the "Summary" button (window.print) renders just
 * this clean one-pager: identity, per-W-2 breakdown, totals, flags, and a review
 * attestation line. The rest of the app is print:hidden.
 */
export function CoverSheet() {
  const { documents } = usePacket();
  const extracted = documents.filter((d) => docCurrentW2(d));
  if (extracted.length === 0) return null;

  const inputs = reconcileInputs(documents);
  const recon = reconcilePacket(inputs);
  const yoy = yearOverYear(inputs);
  const client = docCurrentW2(extracted[0]);
  const edits = documents.reduce((s, d) => s + d.audit.filter((a) => a.action === "edit").length, 0);
  const confirms = documents.reduce((s, d) => s + d.confirmed.length, 0);
  const flags = recon.crossDocIssues.map((i) => i.message).concat(yoy.flatMap((y) => y.notes.map((n) => n.message)));

  return (
    <div className="hidden text-black print:block">
      <div className="mb-5 flex items-baseline justify-between border-b border-black pb-2">
        <h1 className="text-xl font-bold">Client W-2 Summary</h1>
        <span className="text-sm font-medium">TrueForm</span>
      </div>

      <div className="mb-4 text-sm">
        <div>
          <span className="font-semibold">Client:</span> {client?.employee.name.value ?? "-"}
        </div>
        <div>
          <span className="font-semibold">SSN:</span> {client?.employee.ssn.value ?? "-"}
        </div>
        <div>
          <span className="font-semibold">Forms:</span> {extracted.length} W-2
          {extracted.length === 1 ? "" : "s"}
        </div>
      </div>

      <table className="mb-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-black text-left">
            <th className="py-1 pr-2">Employer</th>
            <th className="py-1 pr-2">Year</th>
            <th className="py-1 pr-2 text-right">Box 1 wages</th>
            <th className="py-1 pr-2 text-right">Box 2 withheld</th>
            <th className="py-1 text-right">Status</th>
          </tr>
        </thead>
        <tbody>
          {extracted.map((d) => {
            const w = docCurrentW2(d)!;
            const s = docSummary(d);
            const status =
              s.kind === "done" ? (s.ready ? "Ready" : `${s.errors} err · ${s.reviews} review`) : s.kind;
            return (
              <tr key={d.id} className="border-b border-gray-400">
                <td className="py-1 pr-2">{w.employer.name.value ?? "-"}</td>
                <td className="py-1 pr-2">{w.taxYear.value ?? "-"}</td>
                <td className="py-1 pr-2 text-right">{w.box1_wages.value != null ? usd(w.box1_wages.value) : "-"}</td>
                <td className="py-1 pr-2 text-right">{w.box2_fedWithholding.value != null ? usd(w.box2_fedWithholding.value) : "-"}</td>
                <td className="py-1 text-right">{status}</td>
              </tr>
            );
          })}
          <tr className="font-bold">
            <td className="py-1 pr-2" colSpan={2}>
              Total
            </td>
            <td className="py-1 pr-2 text-right">{usd(recon.aggregates.totalBox1Wages)}</td>
            <td className="py-1 pr-2 text-right">{usd(recon.aggregates.totalBox2Withholding)}</td>
            <td />
          </tr>
        </tbody>
      </table>

      {flags.length > 0 && (
        <div className="mb-4 text-sm">
          <div className="font-semibold">Flags for review</div>
          <ul className="ml-5 list-disc">
            {flags.map((f, k) => (
              <li key={k}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-6 text-sm">
        <span className="font-semibold">Review:</span> {edits} correction{edits === 1 ? "" : "s"} applied,{" "}
        {confirms} field{confirms === 1 ? "" : "s"} confirmed.
      </div>

      <div className="border-t border-black pt-2 text-xs">
        Prepared with TrueForm · {new Date().toLocaleDateString()} · Reviewed by
        ______________________
      </div>
    </div>
  );
}
