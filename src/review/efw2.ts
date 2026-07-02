import type { W2 } from "@/lib/w2-schema";
import { box12Label } from "./box12-codes.js";

/**
 * EFW2 export — the SSA's "Specifications for Filing Forms W-2 Electronically."
 * This fixed-width record layout is what payroll systems and the SSA's Business
 * Services Online actually consume, so it's the most literal answer to "get the
 * data into tax software downstream."
 *
 * We emit the records that carry the W-2 box data:
 *   RW — Employee Wage Record (boxes 1–14)
 *   RS — State Record (boxes 15–20), one per state row
 * A complete SSA transmission also wraps these in RA/RE/RT/RF envelope records
 * (submitter, employer, totals, final); those carry no per-employee box data and
 * are out of scope here. Positions follow the EFW2 spec (1-indexed, inclusive).
 */

const RECORD_LEN = 512;

const blankRecord = () => new Array<string>(RECORD_LEN).fill(" ");

// Place a raw string at 1-indexed positions [start, end], truncated to width.
function put(buf: string[], start: number, end: number, raw: string) {
  const width = end - start + 1;
  const s = raw.slice(0, width);
  for (let i = 0; i < width; i++) buf[start - 1 + i] = s[i] ?? " ";
}

// Alpha field: uppercase, left-justified, space-filled (the blank-record default).
function alpha(buf: string[], start: number, end: number, v: string | null | undefined) {
  put(buf, start, end, (v ?? "").toUpperCase().replace(/[^A-Z0-9 &'./-]/g, ""));
}

// Money field: dollars.cents -> integer cents, right-justified, zero-filled.
function money(buf: string[], start: number, end: number, v: number | null | undefined) {
  const width = end - start + 1;
  const cents = Math.max(0, Math.round((v ?? 0) * 100));
  put(buf, start, end, String(cents).padStart(width, "0"));
}

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const ssn9 = (s: string | null | undefined) => digits(s).padStart(9, "0").slice(0, 9);

function splitName(full: string | null | undefined): { first: string; middle: string; last: string } {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", middle: "", last: "" };
  if (parts.length === 1) return { first: parts[0], middle: "", last: "" };
  return { first: parts[0], last: parts[parts.length - 1], middle: parts.slice(1, -1).join(" ") };
}

// Box 12 code -> its dedicated money position in the RW record. Codes without a
// carried position in RW are simply omitted (they ride elsewhere in a full file).
const BOX12_RW: Record<string, [number, number]> = {
  D: [287, 297], E: [298, 308], F: [309, 319], G: [320, 330], H: [331, 341],
  W: [364, 374], Q: [386, 396], C: [408, 418], V: [419, 429], Y: [430, 440],
  AA: [441, 451], BB: [452, 462], DD: [463, 473],
};

// FIPS numeric state codes for the RS record.
const FIPS: Record<string, string> = {
  AL: "01", AK: "02", AZ: "04", AR: "05", CA: "06", CO: "08", CT: "09", DE: "10", DC: "11",
  FL: "12", GA: "13", HI: "15", ID: "16", IL: "17", IN: "18", IA: "19", KS: "20", KY: "21",
  LA: "22", ME: "23", MD: "24", MA: "25", MI: "26", MN: "27", MS: "28", MO: "29", MT: "30",
  NE: "31", NV: "32", NH: "33", NJ: "34", NM: "35", NY: "36", NC: "37", ND: "38", OH: "39",
  OK: "40", OR: "41", PA: "42", RI: "44", SC: "45", SD: "46", TN: "47", TX: "48", UT: "49",
  VT: "50", VA: "51", WA: "53", WV: "54", WI: "55", WY: "56",
};

function rwRecord(w2: W2): string {
  const b = blankRecord();
  const { first, middle, last } = splitName(w2.employee.name.value);
  put(b, 1, 2, "RW");
  put(b, 3, 11, ssn9(w2.employee.ssn.value));
  alpha(b, 12, 26, first);
  alpha(b, 27, 41, middle);
  alpha(b, 42, 61, last);
  alpha(b, 66, 87, w2.employee.address.value); // location/delivery address (simplified to one field)
  money(b, 188, 198, w2.box1_wages.value);
  money(b, 199, 209, w2.box2_fedWithholding.value);
  money(b, 210, 220, w2.box3_ssWages.value);
  money(b, 221, 231, w2.box4_ssTax.value);
  money(b, 232, 242, w2.box5_medicareWages.value);
  money(b, 243, 253, w2.box6_medicareTax.value);
  money(b, 254, 264, w2.box7_ssTips.value);
  money(b, 276, 286, w2.box10_dependentCare.value);
  for (const e of w2.box12) {
    const pos = BOX12_RW[(e.code.value ?? "").toUpperCase()];
    if (pos) money(b, pos[0], pos[1], e.amount.value);
  }
  put(b, 486, 486, w2.box13.statutoryEmployee ? "1" : "0");
  put(b, 488, 488, w2.box13.retirementPlan ? "1" : "0");
  put(b, 489, 489, w2.box13.thirdPartySickPay ? "1" : "0");
  return b.join("");
}

function rsRecord(w2: W2, row: W2["stateLocal"][number]): string {
  const b = blankRecord();
  const { first, middle, last } = splitName(w2.employee.name.value);
  const fips = FIPS[(row.state.value ?? "").toUpperCase()] ?? "  ";
  put(b, 1, 2, "RS");
  put(b, 3, 4, fips);
  put(b, 10, 18, ssn9(w2.employee.ssn.value));
  alpha(b, 19, 33, first);
  alpha(b, 34, 48, middle);
  alpha(b, 49, 68, last);
  alpha(b, 248, 267, digits(row.employerStateId.value)); // state employer account number
  put(b, 274, 275, fips);
  money(b, 276, 286, row.stateWages.value);
  money(b, 287, 297, row.stateIncomeTax.value);
  money(b, 310, 320, row.localWages.value);
  money(b, 321, 331, row.localIncomeTax.value);
  alpha(b, 338, 352, row.localityName.value);
  return b.join("");
}

/** EFW2 wage-record block: RW + one RS per state, as CRLF-delimited 512-char lines. */
export function buildEFW2(w2: W2): string {
  const records = [rwRecord(w2)];
  for (const row of w2.stateLocal) {
    if (row.state.value || row.stateWages.value != null) records.push(rsRecord(w2, row));
  }
  return records.join("\r\n") + "\r\n";
}

// --- human-readable import map: every box -> where it lands downstream ---------

export interface FieldMapRow {
  box: string;
  label: string;
  value: string;
  mapsTo: string;
}

const usd = (v: number | null | undefined) =>
  v == null ? "-" : v.toLocaleString("en-US", { style: "currency", currency: "USD" });

/** Plain-English mapping of each populated box to how a 1040 preparer consumes it. */
export function fieldMap(w2: W2): FieldMapRow[] {
  const rows: FieldMapRow[] = [
    { box: "1", label: "Wages, tips, other comp.", value: usd(w2.box1_wages.value), mapsTo: "Form 1040, line 1a" },
    { box: "2", label: "Federal income tax withheld", value: usd(w2.box2_fedWithholding.value), mapsTo: "Form 1040, line 25a" },
    { box: "3", label: "Social security wages", value: usd(w2.box3_ssWages.value), mapsTo: "SS wage-base / excess-SS check" },
    { box: "4", label: "Social security tax withheld", value: usd(w2.box4_ssTax.value), mapsTo: "Sch 3, line 11 (excess SS, multi-employer)" },
    { box: "5", label: "Medicare wages and tips", value: usd(w2.box5_medicareWages.value), mapsTo: "Form 8959 (Additional Medicare)" },
    { box: "6", label: "Medicare tax withheld", value: usd(w2.box6_medicareTax.value), mapsTo: "Form 8959" },
  ];
  for (const e of w2.box12) {
    if (!e.code.value) continue;
    rows.push({
      box: `12 · ${e.code.value}`,
      label: box12Label(e.code.value) ?? "Box 12 amount",
      value: usd(e.amount.value),
      mapsTo: "informational / per-code treatment",
    });
  }
  for (const s of w2.stateLocal) {
    if (!s.state.value) continue;
    rows.push({ box: "16", label: `State wages (${s.state.value})`, value: usd(s.stateWages.value), mapsTo: `${s.state.value} state return` });
    rows.push({ box: "17", label: `State income tax (${s.state.value})`, value: usd(s.stateIncomeTax.value), mapsTo: `${s.state.value} state return` });
  }
  return rows;
}
