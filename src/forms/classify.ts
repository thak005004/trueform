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
  /** A KNOWN_FORM_IDS id, or "unknown" (the fail-safe). */
  formType: string;
  confidence: "high" | "low";
  note: string | null;
}

const Shape = z.object({
  formType: z.string(),
  confidence: z.enum(["high", "low"]),
  note: z.string().nullable(),
});

const UNKNOWN: Classification = { formType: "unknown", confidence: "low", note: "Could not confidently identify the form." };

export async function classifyForm(pages: PageImage[], client = new Anthropic()): Promise<Classification> {
  if (pages.length === 0) return UNKNOWN;

  const options = KNOWN_FORM_IDS.map((id) => `- "${id}": ${FORM_LABELS[id]}`).join("\n");
  const system = `You identify which US tax form a scanned document is, for a routing step.

Choose exactly one id from this list, or "unknown":
${options}
- "unknown": anything else — a different tax form, an ambiguous image, or not a tax form at all.

Set confidence to "high" ONLY when the form's title/layout clearly and unambiguously matches one of the known ids. If you are unsure, if it could be more than one, or if it is a form not in the list, answer "unknown" with confidence "low". Do not guess. Return data only via the tool.`;

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

    const { formType, confidence, note } = parsed.data;
    // FAIL SAFE: only accept a KNOWN id at HIGH confidence. Everything else → unknown.
    if (!KNOWN_FORM_IDS.includes(formType) || confidence !== "high") {
      return { formType: "unknown", confidence, note: note ?? UNKNOWN.note };
    }
    return { formType, confidence, note };
  } catch {
    // A classifier failure must not take down extraction — fail safe to human review.
    return UNKNOWN;
  }
}
