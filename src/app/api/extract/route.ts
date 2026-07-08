import { NextResponse } from "next/server";
import { extractW2, type PageImage } from "@/lib/extraction";
import { validateW2 } from "@/lib/validation";
import { detectForms } from "@/review/detect-forms";

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

  // --- Extract + validate (model/transport failure → 422/500) -----------
  try {
    // Run the real extraction and a cheap "how many people are on this page"
    // scan concurrently, so the scan adds no wall-clock time. The scan is
    // best-effort: if it fails, extraction still returns and we just skip the
    // multi-form warning (never let a guardrail take down the core path).
    const [outcome, formScan] = await Promise.all([
      extractW2(pages),
      detectForms(pages).catch((e) => {
        console.error("Form scan failed (non-fatal):", e);
        return null;
      }),
    ]);

    if (!outcome.ok || !outcome.data) {
      // The model didn't produce schema-valid output (no tool call, or zod
      // rejected it). Surface the detail so we can see WHY, per the brief.
      return NextResponse.json(
        {
          error:
            "Extraction failed: the model output did not match the expected W-2 schema.",
          zodIssues: outcome.zodError?.issues ?? null,
          rawToolInput: outcome.rawToolInput ?? null,
        },
        { status: 422 },
      );
    }

    const extraction = outcome.data;
    const validation = validateW2(extraction.w2);
    return NextResponse.json({ extraction, validation, formScan });
  } catch (e) {
    // Anthropic API error, network failure, timeout, etc. — don't crash.
    const message = e instanceof Error ? e.message : "Unknown extraction error.";
    return NextResponse.json(
      { error: `Extraction request failed: ${message}` },
      { status: 500 },
    );
  }
}
