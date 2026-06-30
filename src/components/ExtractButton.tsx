"use client";

import { useDocument } from "@/state/document-context";

/**
 * Primary action once a document is rendered: POST the pages to /api/extract.
 * Uses the indigo accent (the design system's "primary action" color) to stand
 * apart from the ink-colored upload/replace control.
 */
export function ExtractButton() {
  const { status, extractStatus, extract } = useDocument();

  if (status !== "ready") return null;

  const busy = extractStatus === "extracting";
  return (
    <button
      type="button"
      onClick={extract}
      disabled={busy}
      className="rounded-control bg-accent px-3.5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {busy ? "Extracting…" : extractStatus === "done" ? "Re-extract" : "Extract"}
    </button>
  );
}
