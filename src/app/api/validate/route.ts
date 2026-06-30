import { NextResponse } from "next/server";
import { validateW2 } from "@/lib/validation";
import { W2 } from "@/lib/w2-schema";

// Re-validation endpoint for live editing: the client POSTs the edited W2 object,
// we run the SAME validateW2 from the lib and return fresh issues/byField/summary.
// Validation logic is never reimplemented in the client — it stays in src/lib.
export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // Parse with the lib's own zod schema so a malformed edit can't crash validateW2.
  const parsed = W2.safeParse((body as { w2?: unknown })?.w2);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Body must contain a valid `w2` object.", zodIssues: parsed.error.issues },
      { status: 400 },
    );
  }

  const validation = validateW2(parsed.data);
  return NextResponse.json(validation);
}
