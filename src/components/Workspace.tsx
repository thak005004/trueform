"use client";

import { DocumentProvider } from "@/state/document-context";
import { Uploader } from "./Uploader";
import { ExtractButton } from "./ExtractButton";
import { DocumentViewer } from "./DocumentViewer";

/**
 * Top-level client shell: a quiet ink-on-paper header above the document viewer
 * pane. The right-hand fields/review pane will slot in here in a later step.
 */
export function Workspace() {
  return (
    <DocumentProvider>
      <div className="flex h-screen flex-col bg-paper">
        <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <LogoMark />
            <div className="flex items-baseline gap-2">
              <span className="text-base font-semibold tracking-tight text-ink">
                TrueForm
              </span>
              <span className="hidden text-sm text-ink-2 sm:inline">
                W-2 review
              </span>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <ExtractButton />
            <Uploader />
          </div>
        </header>
        <main className="min-h-0 flex-1">
          <DocumentViewer />
        </main>
      </div>
    </DocumentProvider>
  );
}

/** Small wordmark mark — a check, nodding to TrueForm's verify-and-trust thesis. */
function LogoMark() {
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-ink text-white">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m5 12.5 4.5 4.5L19 7" />
      </svg>
    </span>
  );
}
