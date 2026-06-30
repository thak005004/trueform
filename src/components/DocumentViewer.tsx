"use client";

import { useDocument } from "@/state/document-context";
import { IntroScene } from "./IntroScene";
import { PageStack } from "./review/PageStack";
import { ReviewLayout } from "./review/ReviewLayout";

/**
 * Top-level switch for the main pane:
 *   idle       → intro scene
 *   rendering  → spinner
 *   error      → render error
 *   ready      → document only (pre-extract), or the two-pane review once
 *                extraction has returned { extraction, validation }.
 */
export function DocumentViewer() {
  const { pages, status, error, extractStatus, extractError, result } =
    useDocument();

  if (status === "idle") return <IntroScene />;

  if (status === "rendering") {
    return (
      <Centered>
        <p className="animate-pulse text-ink-2">Rendering document…</p>
      </Centered>
    );
  }

  if (status === "error") {
    return (
      <Centered>
        <div className="max-w-md rounded-card border border-error/30 bg-error-bg px-4 py-3 text-center text-sm text-error">
          {error}
        </div>
      </Centered>
    );
  }

  // ready: once extraction succeeds, the review UI takes over.
  if (result) return <ReviewLayout />;

  return (
    <div className="h-full overflow-auto bg-paper">
      {extractStatus === "extracting" && (
        <div className="sticky top-0 z-10 border-b border-line bg-surface px-4 py-2 text-sm text-ink-2">
          <span className="animate-pulse">Extracting and validating…</span>
        </div>
      )}
      {extractStatus === "error" && (
        <div className="px-4 pt-4">
          <div className="mx-auto max-w-3xl rounded-card border border-error/30 bg-error-bg px-4 py-3 text-sm text-error">
            {extractError}
          </div>
        </div>
      )}
      <PageStack pages={pages} />
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center bg-paper p-6">
      {children}
    </div>
  );
}
