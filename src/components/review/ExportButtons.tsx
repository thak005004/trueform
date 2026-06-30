"use client";

import { useReview } from "@/review/review-context";
import { downloadCSV, downloadJSON } from "@/review/export-download";

/**
 * Export the CURRENT corrected W-2 (post-edits) as JSON or CSV. Always available;
 * emphasized once all flags are resolved (the "ready to export" moment).
 */
export function ExportButtons({ emphasized }: { emphasized: boolean }) {
  const { w2 } = useReview();
  const cls = `inline-flex items-center gap-1.5 rounded-control px-2.5 py-1.5 text-xs font-medium transition-colors ${
    emphasized
      ? "bg-ink text-white hover:bg-accent"
      : "border border-line text-ink-2 hover:bg-paper"
  }`;

  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => downloadJSON(w2)} className={cls}>
        <DownloadIcon />
        Export JSON
      </button>
      <button type="button" onClick={() => downloadCSV(w2)} className={cls}>
        <DownloadIcon />
        Export CSV
      </button>
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12" />
      <path d="m7 11 5 4 5-4" />
      <path d="M5 21h14" />
    </svg>
  );
}
