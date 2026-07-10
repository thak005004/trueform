import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { PageImage } from "@/lib/extraction";
import { FORM_LABELS, KNOWN_FORM_IDS } from "./registry";

/**
 * FORM CLASSIFIER — a new, UNTRUSTED model call, so it FAILS SAFE.
 * ---------------------------------------------------------------
 * Same principle as the rest of TrueForm: never trust the model blindly. This is
 * a cheap first pass that names the form type so the router can pick the right
 * definition. But a classifier can be wrong, so anything short of a confident
 * match to a KNOWN form collapses to "unknown" → the document is routed to human
 * review, never silently extracted as a guessed form. A wrong guess here would
 * run the wrong tax rules on someone's return; "unknown" is the safe failure.
 */

const MODEL = process.env.DETECT_MODEL ?? process.env.EXTRACTION_MODEL ?? "claude-haiku-4-5";

export interface Classification {
  /** A KNOWN_FORM_IDS id, or "unknown" (no confident match to a defined form). */
  formType: string;
  confidence: "high" | "low";
  /** Is this ANY US tax form? Gates the generic "extract but don't verify" tier. */
  isTaxForm: boolean;
  /** Best-guess human name, e.g. "Form 1098 (Mortgage Interest)" — labels the generic tier. */
  formName: string | null;
  note: string | null;
}

const Shape = z.object({
  formType: z.string(),
  confidence: z.enum(["high", "low"]),
  isTaxForm: z.boolean(),
  formName: z.string().nullable(),
  note: z.string().nullable(),
});

const UNKNOWN: Classification = { formType: "unknown", confidence: "low", isTaxForm: false, formName: null, note: "Could not confidently identify the form." };

export async function classifyForm(pages: PageImage[], client = new Anthropic()): Promise<Classification> {
  if (pages.length === 0) return UNKNOWN;

  const options = KNOWN_FORM_IDS.map((id) => `- "${id}": ${FORM_LABELS[id]}`).join("\n");
  const system = `You classify a scanned document for a tax-form routing step. Report three things.

1. formType: choose exactly one id from this list, or "unknown":
${options}
- "unknown": any tax form NOT in the list above, an ambiguous image, or a non-tax document.
Set confidence "high" ONLY when the title/layout clearly and unambiguously matches a listed id. If unsure or it's a form not in the list, use "unknown" / "low". Do not guess a listed id.

2. isTaxForm: true if this is ANY US tax form (IRS or state — W-2, 1099 variants, 1098, 1040, K-1, W-9, a tax notice, etc.), false if it is not a tax document at all (a photo, a spreadsheet, a receipt, marketing, etc.).

3. formName: your best-guess human name for the form (e.g. "Form 1098 - Mortgage Interest Statement"), or null if not a tax form.

Return data only via the tool.`;

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 256,
      system,
      tools: [{ name: "report_form_type", description: "Report the identified form type.", input_schema: z.toJSONSchema(Shape, { target: "draft-7" }) as Anthropic.Tool.InputSchema }],
      tool_choice: { type: "tool", name: "report_form_type" },
      messages: [
        {
          role: "user",
          content: [
            ...pages.map((p) => ({ type: "image" as const, source: { type: "base64" as const, media_type: p.mediaType, data: p.base64 } })),
            { type: "text" as const, text: `Which tax form is this? Choose a known id or "unknown".` },
          ],
        },
      ],
    });

    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") return UNKNOWN;
    const parsed = Shape.safeParse(toolUse.input);
    if (!parsed.success) return UNKNOWN;

    const { formType, confidence, isTaxForm, formName, note } = parsed.data;
    // FAIL SAFE for the VERIFIED tier: only a KNOWN id at HIGH confidence gets the
    // form-specific tax rules. Everything else falls to "unknown" — but we keep
    // isTaxForm/formName so the router can still offer generic (unverified)
    // extraction for a tax form we just don't have a definition for.
    if (!KNOWN_FORM_IDS.includes(formType) || confidence !== "high") {
      return { formType: "unknown", confidence, isTaxForm, formName, note: note ?? UNKNOWN.note };
    }
    return { formType, confidence, isTaxForm, formName, note };
  } catch {
    // A classifier failure must not take down extraction — fail safe to human review.
    return UNKNOWN;
  }
}
