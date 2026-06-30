import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { W2Extraction, type W2Extraction as W2ExtractionT } from "./w2-schema.js";

/**
 * EXTRACTION MODULE
 * -----------------
 * Turns rendered document page images into a typed W2Extraction.
 *
 * Key decisions:
 *  - Forced TOOL USE, not "return JSON in your message". We hand the model a
 *    tool whose input schema IS our zod schema (via z.toJSONSchema) and force
 *    it to call that tool. This is the most reliable way to get structurally
 *    valid output; we still re-validate with zod because "schema-shaped" is not
 *    the same as "schema-valid".
 *  - We pass ALL pages of one document in a single request so the model can use
 *    cross-page context (some W-2s print boxes across the page fold).
 *  - We ask for normalized bounding boxes (0..1) per value for source linking.
 *    Honest caveat: vision-model bbox accuracy is imperfect. The UI must degrade
 *    gracefully — if bbox is null, fall back to showing the `snippet`. Source
 *    linking is a verification aid, not a guarantee of pixel precision.
 *  - Blank box vs unreadable: we instruct present=false ONLY for genuinely empty
 *    boxes, so the validator can tell "Box 7 is correctly blank" from "we missed it".
 */

const MODEL = process.env.EXTRACTION_MODEL ?? "claude-sonnet-4-6";

export interface PageImage {
  base64: string;
  mediaType: "image/png" | "image/jpeg" | "image/webp";
}

const SYSTEM = `You extract data from US IRS Form W-2 images for a professional tax preparer. Accuracy and honesty matter more than completeness.

Rules:
- Read EVERY box. Use the official box numbers/labels, not visual position guesses.
- For each value set "raw" to the text exactly as printed (keep cents, commas, $).
  Set "value" to the normalized form (numbers as plain numbers, no $ or commas).
- If a box is genuinely EMPTY on the form, set present=false and value=null. Do NOT
  invent zeros. If a box is present but you cannot read it confidently, still set
  present=true, put your best read in raw, and set value to your best parse (or null
  if truly illegible). Never fabricate a plausible-looking number.
- Provide a "source" for every value you DO read: the 0-indexed page and a bounding
  box with x,y,width,height as fractions (0..1) of the page, tight around the value.
  If you cannot localize it, set bbox=null but still fill snippet with the printed text.
- box12 is an array of up to 4 {code, amount} entries actually present on the form.
- stateLocal is an array — include one row per state/locality present (multi-state W-2s exist).
- Do not include commentary. Return data only via the provided tool.`;

export interface ExtractionOutcome {
  ok: boolean;
  data?: W2ExtractionT;
  /** Raw tool input when zod validation failed, for debugging/repair. */
  rawToolInput?: unknown;
  zodError?: z.ZodError;
}

export async function extractW2(
  pages: PageImage[],
  client = new Anthropic(),
): Promise<ExtractionOutcome> {
  const toolSchema = z.toJSONSchema(W2Extraction, { target: "draft-7" });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM,
    tools: [
      {
        name: "submit_w2",
        description: "Submit the structured W-2 extraction.",
        input_schema: toolSchema as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: "submit_w2" },
    messages: [
      {
        role: "user",
        content: [
          ...pages.map(
            (p, i) =>
              ({
                type: "image" as const,
                source: { type: "base64" as const, media_type: p.mediaType, data: p.base64 },
                // a small text marker helps the model attach correct page indices
              }),
          ),
          {
            type: "text",
            text: `This document has ${pages.length} page image(s), 0-indexed in order. Extract the W-2 and call submit_w2.`,
          },
        ],
      },
    ],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return { ok: false, rawToolInput: undefined };
  }

  const parsed = W2Extraction.safeParse(toolUse.input);
  if (!parsed.success) {
    return { ok: false, rawToolInput: toolUse.input, zodError: parsed.error };
  }
  return { ok: true, data: parsed.data };
}
