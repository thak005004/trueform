import { NextResponse } from "next/server";
import { extractW2, type PageImage } from "@/lib/extraction";
import { validateW2 } from "@/lib/validation";
import { detectForms } from "@/review/detect-forms";
import { classifyForm } from "@/forms/classify";
import { extractForm } from "@/forms/extract-form";
import { extractGeneric } from "@/forms/extract-generic";
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
    // 1. Classify FIRST (untrusted). This tells us three things: which known form
    //    it is (if any), whether it's a tax form at all, and its best-guess name.
    const classification = await classifyForm(pages);
    const knownDef = classification.formType !== "unknown" ? getForm(classification.formType) : null;

    // --- TIER 1 (VERIFIED): a KNOWN form at HIGH confidence gets its tax rules. ---
    if (knownDef && classification.confidence === "high") {
      // W-2 keeps its own rich extraction path (unchanged) + the multi-person scan.
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

      // Any other known form: build the schema from the definition, extract, validate.
      const outcome = await extractForm(pages, knownDef);
      if (!outcome.ok || !outcome.data) {
        return NextResponse.json(
          { error: `Extraction failed: the model output did not match the ${knownDef.name} schema.`, zodIssues: outcome.zodError?.issues ?? null },
          { status: 422 },
        );
      }
      const instance: FormInstance = outcome.data;
      if (!Object.values(instance.fields).some((f) => f.present)) {
        return NextResponse.json({ error: `Couldn't read this as a ${knownDef.name}. Check the file, or try re-extracting.` }, { status: 422 });
      }
      const validation = runValidation(instance, knownDef);
      return NextResponse.json({ formType: classification.formType, instance, validation, verified: true, classification });
    }

    // --- TIER 2 (UNVERIFIED): any OTHER tax form → discover fields, apply NO rules. ---
    // "Extract from any tax form" without over-claiming trust: we pull what's on
    // the page and mark it unverified, rather than inventing tax math we don't have.
    if (classification.isTaxForm) {
      const g = await extractGeneric(pages);
      if (!g.ok || !g.data) {
        return NextResponse.json({ error: "Couldn't extract fields from this form.", zodIssues: g.zodError?.issues ?? null }, { status: 422 });
      }
      if (!Object.values(g.data.instance.fields).some((f) => f.present)) {
        return NextResponse.json({ error: "Couldn't read any fields from this document." }, { status: 422 });
      }
      return NextResponse.json({ formType: "generic", verified: false, formName: g.data.formName, instance: g.data.instance, schema: g.data.schema, classification });
    }

    // --- Not a tax form at all → fail safe to human review. ---
    return NextResponse.json({ formType: "unknown", classification });
  } catch (e) {
    // Anthropic API error, network failure, timeout, etc. — don't crash.
    const message = e instanceof Error ? e.message : "Unknown extraction error.";
    return NextResponse.json(
      { error: `Extraction request failed: ${message}` },
      { status: 500 },
    );
  }
}
