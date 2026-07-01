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
  const { documents, activeId, view, openDashboard, reset } = usePacket();
  const hasDocs = documents.length > 0;
  const showBack = view === "document" && documents.length > 1;
  const extractingCount = documents.filter((d) => d.extractStatus === "extracting").length;

  return (
    <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3 sm:px-6">
      <div className="flex items-center gap-2.5">
        <LogoMark />
        <div className="flex items-baseline gap-2">
          <span className="text-base font-semibold tracking-tight text-ink">TrueForm</span>
          <span className="hidden text-sm text-ink-2 sm:inline">W-2 review</span>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {extractingCount > 0 && (
          <span className="figure mr-1 hidden items-center gap-1.5 text-xs text-ink-3 sm:inline-flex">
            <Spinner />
            Extracting {extractingCount}…
          </span>
        )}
        {showBack && (
          <button
            type="button"
            onClick={openDashboard}
            className="rounded-control px-2.5 py-2 text-sm text-ink-2 hover:bg-paper"
          >
            ← Packet ({documents.length})
          </button>
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
