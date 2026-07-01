import type { W2 } from "@/lib/w2-schema";
import type { Issue } from "@/lib/validation";
import { constantsForYear, round2 } from "@/lib/tax-constants";

/**
 * Plain-English "show the math" for a flagged field: the actual computation with
 * the form's numbers plugged in. Recomputed client-side from the SAME tax
 * constants the lib uses (imported, not duplicated) so it stays honest and
 * transparent — the preparer sees exactly why a value is off.
 */
const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const v = (f?: { value: number | null }) => f?.value ?? 0;

export function explainMath(issues: Issue[], w2: W2): string | null {
  const codes = new Set(issues.map((i) => i.code));
  const { used: c, resolvedYear } = constantsForYear(w2.taxYear?.value);

  if (codes.has("SS_TAX_MISMATCH")) {
    const raw = v(w2.box3_ssWages) + v(w2.box7_ssTips);
    const taxable = Math.min(raw, c.ssWageBase);
    const expected = round2(taxable * c.ssRate);
    const capNote = raw > c.ssWageBase ? `, capped at the ${resolvedYear} ${usd(c.ssWageBase)} wage base` : "";
    return `6.2% × ${usd(taxable)} (Box 3 + Box 7${capNote}) = ${usd(expected)}`;
  }

  if (codes.has("MEDICARE_TAX_MISMATCH")) {
    const med = v(w2.box5_medicareWages);
    const addl = Math.max(0, med - c.additionalMedicareThreshold);
    const expected = round2(med * c.medicareRate + addl * c.additionalMedicareRate);
    return addl > 0
      ? `1.45% × ${usd(med)} (Box 5) + 0.9% × ${usd(addl)} over $200k = ${usd(expected)}`
      : `1.45% × ${usd(med)} (Box 5) = ${usd(expected)}`;
  }

  if (codes.has("SS_CAP_EXCEEDED")) {
    const sum = v(w2.box3_ssWages) + v(w2.box7_ssTips);
    return `Box 3 + Box 7 = ${usd(sum)}, over the ${resolvedYear} Social Security wage base of ${usd(c.ssWageBase)}`;
  }

  return null;
}
