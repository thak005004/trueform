/**
 * Year-indexed federal payroll-tax constants used by the validation engine.
 *
 * These change every year. Hardcoding them from memory is a real risk, so the
 * figures below were verified against SSA / IRS-aligned sources (Oct 2024 &
 * Oct 2025 SSA announcements; SS wage base history). If you extend this past
 * 2026, re-verify against the SSA "Contribution and Benefit Base" table.
 *
 * SS wage base = max earnings subject to the 6.2% Social Security (OASDI) tax.
 * Medicare has no wage cap. Additional Medicare = +0.9% withheld by the
 * employer on wages over $200,000 in a calendar year (flat threshold for
 * withholding, independent of the employee's filing status).
 */

export interface YearConstants {
  ssWageBase: number; // Box 3 + Box 7 cannot exceed this
  ssRate: number; // 0.062
  medicareRate: number; // 0.0145
  additionalMedicareRate: number; // 0.009
  additionalMedicareThreshold: number; // 200_000
  get maxSsTax(): number; // ssWageBase * ssRate
}

function make(ssWageBase: number): YearConstants {
  return {
    ssWageBase,
    ssRate: 0.062,
    medicareRate: 0.0145,
    additionalMedicareRate: 0.009,
    additionalMedicareThreshold: 200_000,
    get maxSsTax() {
      return round2(this.ssWageBase * this.ssRate);
    },
  };
}

export const TAX_CONSTANTS: Record<number, YearConstants> = {
  2021: make(142_800),
  2022: make(147_000),
  2023: make(160_200),
  2024: make(168_600),
  2025: make(176_100),
  2026: make(184_500),
};

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Most-recent year we have constants for; used as a fallback when the W-2's
 *  tax year is missing or out of range, so validation degrades gracefully. */
export const LATEST_KNOWN_YEAR = Math.max(
  ...Object.keys(TAX_CONSTANTS).map(Number),
);

export function constantsForYear(year: number | null | undefined): {
  used: YearConstants;
  resolvedYear: number;
  exact: boolean;
} {
  if (year && TAX_CONSTANTS[year]) {
    return { used: TAX_CONSTANTS[year], resolvedYear: year, exact: true };
  }
  return {
    used: TAX_CONSTANTS[LATEST_KNOWN_YEAR],
    resolvedYear: LATEST_KNOWN_YEAR,
    exact: false,
  };
}
