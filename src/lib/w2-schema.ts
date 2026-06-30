import { z } from "zod";

/**
 * Source grounding for a single extracted value.
 *
 * `bbox` is a normalized bounding box (0..1 relative to page dimensions) so the
 * UI can draw a highlight over the exact region of the rendered document the
 * value was read from. This is what lets a preparer verify a field against the
 * source in one glance instead of hunting across the form.
 */
export const SourceRef = z.object({
  page: z.number().int().min(0).describe("0-indexed page the value was found on"),
  bbox: z
    .object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      width: z.number().min(0).max(1),
      height: z.number().min(0).max(1),
    })
    .nullable()
    .describe("Normalized box over the value on the page; null if not locatable"),
  snippet: z
    .string()
    .nullable()
    .describe("The exact text as printed on the document, before normalization"),
});
export type SourceRef = z.infer<typeof SourceRef>;

/**
 * A money field. We keep BOTH the parsed numeric `value` and the `raw` string
 * exactly as printed. Preserving raw matters: "52,000.00" vs "52000" vs a
 * smudged "S2,000" are all things a preparer may want to see verbatim, and it
 * gives us something to diff against when a normalization looks wrong.
 *
 * `present: false` means the box was genuinely blank on the form (a real signal
 * for a W-2 — e.g. an empty Box 7), distinct from "we couldn't read it".
 */
export const MoneyField = z.object({
  present: z.boolean(),
  value: z.number().nullable().describe("Parsed USD amount, null if absent/unreadable"),
  raw: z.string().nullable(),
  source: SourceRef.nullable(),
});
export type MoneyField = z.infer<typeof MoneyField>;

export const TextField = z.object({
  present: z.boolean(),
  value: z.string().nullable(),
  raw: z.string().nullable(),
  source: SourceRef.nullable(),
});
export type TextField = z.infer<typeof TextField>;

/** Box 12 line: a code (A..HH) plus amount. Up to four appear on a W-2. */
export const Box12Entry = z.object({
  code: TextField,
  amount: MoneyField,
});

/** Boxes 15–20 repeat per state/locality. A multi-state employee has several. */
export const StateLocalRow = z.object({
  state: TextField, // Box 15
  employerStateId: TextField, // Box 15
  stateWages: MoneyField, // Box 16
  stateIncomeTax: MoneyField, // Box 17
  localWages: MoneyField, // Box 18
  localIncomeTax: MoneyField, // Box 19
  localityName: TextField, // Box 20
});

export const W2 = z.object({
  taxYear: z.object({
    present: z.boolean(),
    value: z.number().int().nullable(),
    raw: z.string().nullable(),
    source: SourceRef.nullable(),
  }),

  employer: z.object({
    name: TextField,
    ein: TextField, // box b, format NN-NNNNNNN
    address: TextField,
  }),

  employee: z.object({
    name: TextField,
    ssn: TextField, // box a, format NNN-NN-NNNN
    address: TextField,
  }),

  controlNumber: TextField, // box d

  box1_wages: MoneyField,
  box2_fedWithholding: MoneyField,
  box3_ssWages: MoneyField,
  box4_ssTax: MoneyField,
  box5_medicareWages: MoneyField,
  box6_medicareTax: MoneyField,
  box7_ssTips: MoneyField,
  box8_allocatedTips: MoneyField,
  box10_dependentCare: MoneyField,
  box11_nonqualifiedPlans: MoneyField,

  box12: z.array(Box12Entry).max(4),

  box13: z.object({
    statutoryEmployee: z.boolean(),
    retirementPlan: z.boolean(),
    thirdPartySickPay: z.boolean(),
  }),

  box14_other: z.array(z.object({ label: TextField, amount: MoneyField })),

  stateLocal: z.array(StateLocalRow),
});
export type W2 = z.infer<typeof W2>;

/** The shape we ask the vision model to return. */
export const W2Extraction = z.object({
  documentType: z.literal("W-2"),
  w2: W2,
});
export type W2Extraction = z.infer<typeof W2Extraction>;
