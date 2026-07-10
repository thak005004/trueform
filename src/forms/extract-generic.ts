import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { SourceRef } from "@/lib/w2-schema";
import type { PageImage } from "@/lib/extraction";
import type { ExtractedField, FieldDef, FieldType, FormInstance } from "./types";

/**
 * GENERIC, SCHEMA-LESS EXTRACTION — the "extract from ANY tax form" tier.
 * ----------------------------------------------------------------------
 * For a tax form we DON'T have a definition for, we can't build a fixed schema.
 * So we let the model DISCOVER the fields: pull every labeled box/field with its
 * printed label, best-guess type, and value. We then synthesize a FieldDef[] from
 * what it found, so the same generic renderer can display it.
 *
 * Crucially, this tier carries NO validation rules — we never invent tax math for
 * a form we don't understand. The result is marked UNVERIFIED. That's the honest
 * line the product draws: known forms are verified; any other tax form is
 * extracted and clearly flagged as not machine-checked. Extraction without
 * over-claiming trust.
 */

const MODEL = process.env.EXTRACTION_MODEL ?? "claude-sonnet-4-6";

const DiscoveredField = z.object({
  label: z.string(),
  box: z.string().nullable(),
  type: z.enum(["money", "date", "id", "text"]),
  value: z.string().nullable(),
  raw: z.string().nullable(),
  source: SourceRef.nullable(),
});
const Shape = z.object({
  formName: z.string(),
  // No hard cap: a hard array max hard-fails the whole extraction on a form with
  // many fields. We keep the count reasonable via the prompt instead.
  fields: z.array(DiscoveredField),
});

export interface GenericExtraction {
  formName: string;
  /** Synthesized schema so the generic renderer can group + label the fields. */
  schema: FieldDef[];
  instance: FormInstance;
}

export interface GenericOutcome {
  ok: boolean;
  data?: GenericExtraction;
  rawToolInput?: unknown;
  zodError?: z.ZodError;
}

const mapType = (t: z.infer<typeof DiscoveredField>["type"]): FieldType =>
  t === "id" ? "tin" : t; // keep ids as "tin" so the second read can cross-check them

const parseMoney = (v: string | null): number | null => {
  if (v == null) return null;
  const n = Number(v.replace(/[$,\s]/g, ""));
  return Number.isNaN(n) ? null : n;
};

/** Stable, unique id from a label/box (keys the field map + review rows). */
function slugify(label: string, box: string | null, used: Set<string>): string {
  const base = (box ? `${box}_${label}` : label).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "field";
  let id = base;
  let i = 2;
  while (used.has(id)) id = `${base}_${i++}`;
  used.add(id);
  return id;
}

export async function extractGeneric(pages: PageImage[], client = new Anthropic()): Promise<GenericOutcome> {
  const system = `You extract data from a US tax form for a professional tax preparer. This is a form we don't have a template for, so DISCOVER its fields.

Return the form's name and its labeled fields:
- label: the printed label (e.g. "Payments received for qualified tuition", "Student's TIN").
- box: the box number/letter if the form prints one (e.g. "Box 1", "Box 2a"), else null.
- type: money | date | id | text (your best guess).
- value: the normalized value (numbers as plain numbers for money; strings otherwise), or null if blank.
- raw: the value exactly as printed, or null.
- source: page (0-indexed) + a bounding box (x,y,width,height as 0..1 fractions) tight around the value; bbox null if you can't localize it.

Focus on the form's OFFICIAL boxes and identifying fields (filer/recipient, TINs, tax year, the numbered boxes). If the document has long line-item tables (payment or charge details), capture only their TOTALS, do not enumerate every row. Aim for the ~30 fields that matter, not hundreds.

Do NOT apply tax rules, do NOT invent values, do NOT infer fields that aren't printed. Return data only via the tool.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system,
    tools: [{ name: "submit_generic_form", description: "Submit the discovered fields of an unrecognized tax form.", input_schema: z.toJSONSchema(Shape, { target: "draft-7" }) as Anthropic.Tool.InputSchema }],
    tool_choice: { type: "tool", name: "submit_generic_form" },
    messages: [
      {
        role: "user",
        content: [
          ...pages.map((p) => ({ type: "image" as const, source: { type: "base64" as const, media_type: p.mediaType, data: p.base64 } })),
          { type: "text" as const, text: `This document has ${pages.length} page image(s). Extract the form name and every labeled field, then call submit_generic_form.` },
        ],
      },
    ],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") return { ok: false };
  const parsed = Shape.safeParse(toolUse.input);
  if (!parsed.success) return { ok: false, rawToolInput: toolUse.input, zodError: parsed.error };

  // Synthesize a schema + flat instance from the discovered fields.
  const used = new Set<string>();
  const schema: FieldDef[] = [];
  const fields: Record<string, ExtractedField> = {};
  for (const f of parsed.data.fields) {
    const id = slugify(f.label, f.box, used);
    const type = mapType(f.type);
    schema.push({ id, label: f.label, box: f.box ?? undefined, type, group: "Fields" });
    fields[id] = {
      present: f.value != null && f.value !== "",
      value: type === "money" ? parseMoney(f.value) : f.value,
      raw: f.raw,
      source: f.source,
    };
  }

  return { ok: true, data: { formName: parsed.data.formName, schema, instance: { formType: "generic", fields } } };
}
