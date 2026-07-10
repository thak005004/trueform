"use client";

import { DocumentProvider, usePacket } from "@/state/document-context";
import { Uploader } from "./Uploader";
import { IntroScene } from "./IntroScene";
import { DocumentViewer } from "./DocumentViewer";
import { Dashboard, Spinner } from "./packet/Dashboard";
import { CoverSheet } from "./packet/CoverSheet";
import { downloadSession } from "@/state/session-file";

/**
 * Top-level client shell. A packet-aware header sits above the main pane, which
 * routes between the intro (empty packet), the dashboard (packet view), and the
 * single-document review (drill-in).
 */
export function Workspace() {
  return (
    <DocumentProvider>
      <div className="flex h-screen flex-col bg-paper print:hidden">
        <Header />
        <main className="min-h-0 flex-1">
          <PacketRouter />
        </main>
      </div>
      {/* Print-only client summary (window.print shows just this). */}
      <CoverSheet />
    </DocumentProvider>
  );
}

function Header() {
  const { documents, activeId, active, view, openDashboard, reset } = usePacket();
  const hasDocs = documents.length > 0;
  // In review, always offer a way back to the packet and show which file you're
  // in — even for a single-document packet (which otherwise has no way back).
  const inReview = view === "document" && hasDocs;
  const extractingCount = documents.filter((d) => d.extractStatus === "extracting").length;

  return (
    <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3 sm:px-6">
      <div className="flex shrink-0 items-center gap-2.5">
        <LogoMark />
        <div className="flex items-baseline gap-2">
          <span className="text-base font-semibold tracking-tight text-ink">TrueForm</span>
          <span className="hidden text-sm text-ink-2 sm:inline">Tax form review</span>
        </div>
      </div>

      {inReview && (
        <nav className="flex min-w-0 items-center gap-1.5 border-l border-line pl-3 text-sm">
          <button
            type="button"
            onClick={openDashboard}
            className="shrink-0 rounded-control px-2 py-1 text-ink-2 hover:bg-paper"
            title="Back to the client packet"
          >
            ← Packet ({documents.length})
          </button>
          {active && (
            <>
              <span className="shrink-0 text-ink-3">/</span>
              <span className="figure min-w-0 truncate text-ink-2" title={active.fileName}>
                {active.fileName}
              </span>
            </>
          )}
        </nav>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {extractingCount > 0 && (
          <span className="figure mr-1 hidden items-center gap-1.5 text-xs text-ink-3 sm:inline-flex">
            <Spinner />
            Extracting {extractingCount}…
          </span>
        )}
        {hasDocs && <Uploader />}
        {hasDocs && (
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-control border border-line px-3 py-2 text-sm text-ink-2 hover:bg-paper"
            title="Print / save a one-page client summary"
          >
            Summary
          </button>
        )}
        {hasDocs && (
          <button
            type="button"
            onClick={() => downloadSession(documents, activeId, view)}
            className="rounded-control border border-line px-3 py-2 text-sm text-ink-2 hover:bg-paper"
            title="Save this review session to a file you can reopen later"
          >
            Save
          </button>
        )}
        {hasDocs && (
          <button
            type="button"
            onClick={reset}
            className="rounded-control border border-line px-3 py-2 text-sm text-ink-2 hover:bg-paper"
          >
            New packet
          </button>
        )}
      </div>
    </header>
  );
}

function PacketRouter() {
  const { documents, view } = usePacket();
  if (documents.length === 0) return <IntroScene />;
  if (view === "dashboard") return <Dashboard />;
  return <DocumentViewer />;
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
