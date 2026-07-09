import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { SourceRef } from "@/lib/w2-schema";
import type { PageImage } from "@/lib/extraction";
import type { FieldDef, FormDefinition, FormInstance } from "./types";

/**
 * GENERIC EXTRACTION — the engine builds the tool schema FROM the definition.
 * --------------------------------------------------------------------------
 * This is the sentence to remember: `extractForm` reads a form's `schema`
 * (a list of FieldDef) and CONSTRUCTS the vision model's forced-tool-use input
 * schema at runtime — one zod property per declared field, typed by the field's
 * kind. So the model is constrained to exactly the fields the definition declares,
 * and the result comes back as a flat FormInstance. Add a form = add a schema
 * list; this extractor never changes.
 *
 * W-2 keeps its own richer, hand-authored nested schema (box12/state arrays,
 * per-field grounding) via `extractW2` — some forms are nested enough to warrant
 * a bespoke schema. Both are "the definition supplies the schema"; this one just
 * builds it mechanically from a flat field list, which is all a form like
 * 1099-NEC needs. (Say this tradeoff in the writeup.)
 */

const MODEL = process.env.EXTRACTION_MODEL ?? "claude-sonnet-4-6";

/** One extracted value, mirroring the W-2 field shape so the UI is uniform. */
function fieldSchema(type: FieldDef["type"]) {
  const value = type === "money" || type === "year" ? z.number().nullable() : z.string().nullable();
  return z.object({
    present: z.boolean(),
    value,
    raw: z.string().nullable(),
    source: SourceRef.nullable(),
  });
}

/** Build the zod object the model must return, one property per declared field. */
function buildInstanceSchema(schema: FieldDef[]) {
  const shape: Record<string, ReturnType<typeof fieldSchema>> = {};
  for (const f of schema) shape[f.id] = fieldSchema(f.type);
  return z.object({ fields: z.object(shape) });
}

export interface FormExtractionOutcome {
  ok: boolean;
  data?: FormInstance;
  rawToolInput?: unknown;
  zodError?: z.ZodError;
}

function fieldGuide(schema: FieldDef[]): string {
  return schema
    .map((f) => `- ${f.id}${f.box ? ` (${f.box})` : ""}: ${f.label} [${f.type}]`)
    .join("\n");
}

export async function extractForm(
  pages: PageImage[],
  def: FormDefinition,
  client = new Anthropic(),
): Promise<FormExtractionOutcome> {
  const instanceSchema = buildInstanceSchema(def.schema);
  const toolSchema = z.toJSONSchema(instanceSchema, { target: "draft-7" });

  const system = `You extract data from a US IRS ${def.name} for a professional tax preparer. Accuracy and honesty matter more than completeness.

Return one entry per field below, using the field id as the key.
${fieldGuide(def.schema)}

Rules:
- "raw" = the text exactly as printed (keep cents, commas, $). "value" = normalized (numbers as plain numbers for money/year fields; strings otherwise).
- If a box is genuinely EMPTY, set present=false and value=null. Never invent a value. If present but unreadable, set present=true and value to your best parse (or null).
- Provide a "source" for every value you read: the 0-indexed page and a bounding box (x,y,width,height as 0..1 fractions), tight around the value; bbox=null if you can't localize it, but still fill snippet.
- Do not include commentary. Return data only via the provided tool.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system,
    tools: [
      {
        name: "submit_form",
        description: `Submit the structured ${def.name} extraction.`,
        input_schema: toolSchema as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: "submit_form" },
    messages: [
      {
        role: "user",
        content: [
          ...pages.map((p) => ({
            type: "image" as const,
            source: { type: "base64" as const, media_type: p.mediaType, data: p.base64 },
          })),
          {
            type: "text" as const,
            text: `This document has ${pages.length} page image(s), 0-indexed in order. Extract the ${def.name} and call submit_form.`,
          },
        ],
      },
    ],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") return { ok: false };

  const parsed = instanceSchema.safeParse(toolUse.input);
  if (!parsed.success) return { ok: false, rawToolInput: toolUse.input, zodError: parsed.error };

  return { ok: true, data: { formType: def.id, fields: parsed.data.fields } };
}
