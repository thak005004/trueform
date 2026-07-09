import { NextResponse } from "next/server";
import { extractW2, type PageImage } from "@/lib/extraction";
import { validateW2 } from "@/lib/validation";
import { detectForms } from "@/review/detect-forms";
import { classifyForm } from "@/forms/classify";
import { extractForm } from "@/forms/extract-form";
import { runValidation } from "@/forms/engine";
import { getForm } from "@/forms/registry";
import type { FormInstance } from "@/forms/types";

// The Anthropic SDK needs the Node runtime (not Edge). Extraction is a vision
// call over full-page images, so give it headroom beyond the default timeout.
export const runtime = "nodejs";
export const maxDuration = 60;

const SUPPORTED = new Set(["image/png", "image/jpeg", "image/webp"]);

/**
 * The client sends the rendered document as {dataUrl}[] (from RenderedPage).
 * The core extractor wants {base64, mediaType}. Convert here, server-side, so the
 * lib stays untouched. A data URL looks like: data:image/png;base64,<payload>.
 */
function dataUrlToPageImage(dataUrl: string, index: number): PageImage {
  // [\s\S] instead of . with the /s flag (which needs ES2018) — same effect.
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(dataUrl);
  if (!match) throw new Error(`Page ${index + 1}: not a valid data URL.`);
  const mediaType = match[1] ?? "";
  const isBase64 = Boolean(match[2]);
  const data = match[3] ?? "";
  if (!isBase64) throw new Error(`Page ${index + 1}: expected a base64-encoded data URL.`);
  if (!SUPPORTED.has(mediaType)) {
    throw new Error(`Page ${index + 1}: unsupported image type "${mediaType}".`);
  }
  return { base64: data, mediaType: mediaType as PageImage["mediaType"] };
}

export async function POST(req: Request) {
  // Key is read server-side only. It is NEVER prefixed NEXT_PUBLIC_, so Next
  // never inlines it into the client bundle. We check explicitly so a missing
  // key is a clear 500 rather than an opaque SDK error deep in the call.
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Server is missing ANTHROPIC_API_KEY." },
      { status: 500 },
    );
  }

  // --- Parse + convert the request body (bad input → 400) ---------------
  let pages: PageImage[];
  try {
    const body = await req.json();
    const raw = body?.pages;
    if (!Array.isArray(raw) || raw.length === 0) {
      return NextResponse.json(
        { error: "Request must include a non-empty `pages` array." },
        { status: 400 },
      );
    }
    pages = raw.map((p: { dataUrl?: unknown }, i: number) => {
      if (!p || typeof p.dataUrl !== "string") {
        throw new Error(`Page ${i + 1}: missing dataUrl.`);
      }
      return dataUrlToPageImage(p.dataUrl, i);
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid request body." },
      { status: 400 },
    );
  }

  // --- Classify → route → extract + validate ----------------------------
  try {
    // 1. Classify the document FIRST (untrusted; fails safe to "unknown").
    const classification = await classifyForm(pages);

    // 2. Fail safe: an unidentified / low-confidence form is NEVER guessed —
    //    it routes to human review. Running the wrong form's tax rules on a
    //    return would be worse than doing nothing.
    if (classification.formType === "unknown") {
      return NextResponse.json({ formType: "unknown", classification });
    }

    // 3. W-2 keeps its own rich extraction path (unchanged) + the multi-person
    //    scan. This is the demo-critical path, deliberately untouched.
    if (classification.formType === "w2") {
      const [outcome, formScan] = await Promise.all([
        extractW2(pages),
        detectForms(pages).catch((e) => {
          console.error("Form scan failed (non-fatal):", e);
          return null;
        }),
      ]);
      if (!outcome.ok || !outcome.data) {
        return NextResponse.json(
          { error: "Extraction failed: the model output did not match the expected W-2 schema.", zodIssues: outcome.zodError?.issues ?? null },
          { status: 422 },
        );
      }
      const extraction = outcome.data;
      const validation = validateW2(extraction.w2);
      return NextResponse.json({ formType: "w2", extraction, validation, formScan, classification });
    }

    // 4. Any other KNOWN form goes through the generic engine: build the schema
    //    from the definition, extract, and validate with the same runner.
    const def = getForm(classification.formType);
    if (!def) return NextResponse.json({ formType: "unknown", classification });

    const outcome = await extractForm(pages, def);
    if (!outcome.ok || !outcome.data) {
      return NextResponse.json(
        { error: `Extraction failed: the model output did not match the ${def.name} schema.`, zodIssues: outcome.zodError?.issues ?? null },
        { status: 422 },
      );
    }
    const instance: FormInstance = outcome.data;
    // A form that came back with nothing present is unreadable, not empty.
    if (!Object.values(instance.fields).some((f) => f.present)) {
      return NextResponse.json({ error: `Couldn't read this as a ${def.name}. Check the file, or try re-extracting.` }, { status: 422 });
    }
    const validation = runValidation(instance, def);
    return NextResponse.json({ formType: classification.formType, instance, validation, classification });
  } catch (e) {
    // Anthropic API error, network failure, timeout, etc. — don't crash.
    const message = e instanceof Error ? e.message : "Unknown extraction error.";
    return NextResponse.json(
      { error: `Extraction request failed: ${message}` },
      { status: 500 },
    );
  }
}
