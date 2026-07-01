import type { Issue } from "@/lib/validation";

/**
 * SUGGESTED FIXES
 * ---------------
 * Some validation checks don't just flag a wrong value — they compute the value it
 * SHOULD be (Box 4 = 6.2% of Box 3+7; Box 6 = 1.45% of Box 5 + surtax). That expected
 * amount is deterministic tax math, not a model guess, so we can safely offer it as a
 * one-click fix. We read it out of the issue message the lib already produces (the
 * lib is not modified), so the suggestion stays in lockstep with the check.
 */

// Only the math-mismatch checks carry a single deterministic "expected" value.
const FIXABLE_CODES = new Set(["SS_TAX_MISMATCH", "MEDICARE_TAX_MISMATCH"]);

export interface SuggestedFix {
  value: number;
  display: string;
}

export function suggestedFix(issues: Issue[]): SuggestedFix | null {
  for (const iss of issues) {
    if (!FIXABLE_CODES.has(iss.code)) continue;
    const m = /Expected ~\$([\d,]+(?:\.\d+)?)/.exec(iss.message);
    if (!m) continue;
    const value = parseFloat(m[1].replace(/,/g, ""));
    if (Number.isNaN(value)) continue;
    return {
      value,
      display: value.toLocaleString("en-US", { style: "currency", currency: "USD" }),
    };
  }
  return null;
}
