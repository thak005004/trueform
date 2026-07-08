import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { PageImage } from "@/lib/extraction";

/**
 * MULTI-FORM DETECTION
 * --------------------
 * The core extractor (src/lib) returns exactly ONE W-2 per document, by design.
 * But a single uploaded page can physically hold more than one person's W-2 (an
 * IRS sample sheet, or a batch scanned two-up). If we extracted the first one and
 * said nothing, a preparer would never know a second person was silently dropped
 * — the one failure the trust thesis cannot tolerate. So before the review opens
 * we run a cheap, separate pass that just COUNTS distinct employees, and if there
 * is more than one we warn.
 *
 * We deliberately do NOT extract them all here (that means cropping + re-running
 * per form, a larger feature). This is the honest guardrail, not full multi-form
 * support. Cheap by design: a small vision model and a tiny token budget, run
 * concurrently with the real extraction so it adds no wall-clock time.
 */

// Reuse whatever extraction model is already proven in this deployment; fall back
// to Haiku 4.5, the cheapest current vision model, since counting is easy work.
const MODEL =
  process.env.DETECT_MODEL ?? process.env.EXTRACTION_MODEL ?? "claude-haiku-4-5";

export interface FormScan {
  /** How many DIFFERENT people's W-2s appear across the page image(s). */
  distinctEmployees: number;
  /** Employee names when more than one was seen, for the warning copy. */
  employees: string[];
}

const FormScanShape = z.object({
  distinctEmployees: z.number().int().min(0),
  employees: z.array(z.string()),
});

const SYSTEM = `You are checking whether a scanned page contains more than one person's IRS Form W-2.

Count DISTINCT EMPLOYEES only:
- Several copies of the SAME employee's W-2 (Copy B, Copy C, Copy 2 - the same name/SSN repeated) count as ONE.
- Two forms with DIFFERENT employee names or SSNs count as TWO.
Report distinctEmployees and, when it is more than one, the employee names exactly as printed. Return data only via the tool.`;

/**
 * Returns the distinct-employee count for the page images, or null if the scan
 * could not run (caller treats null as "no warning" — this is best-effort).
 */
export async function detectForms(
  pages: PageImage[],
  client = new Anthropic(),
): Promise<FormScan | null> {
  if (pages.length === 0) return null;

  const toolSchema = z.toJSONSchema(FormScanShape, { target: "draft-7" });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: SYSTEM,
    tools: [
      {
        name: "report_forms",
        description: "Report how many distinct employees' W-2s appear on the page(s).",
        input_schema: toolSchema as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: "report_forms" },
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
            text: `These ${pages.length} page image(s) are one uploaded document. How many distinct employees' W-2s are present?`,
          },
        ],
      },
    ],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") return null;

  const parsed = FormScanShape.safeParse(toolUse.input);
  return parsed.success ? parsed.data : null;
}
