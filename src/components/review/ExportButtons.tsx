"use client";

import { useReview } from "@/review/review-context";
import { downloadCSV, downloadEFW2, downloadFieldMap, downloadJSON } from "@/review/export-download";

/**
 * Export the CURRENT corrected W-2 (post-edits) as JSON or CSV. Always available;
 * emphasized once all flags are resolved (the "ready to export" moment).
 */
export function ExportButtons({ emphasized }: { emphasized: boolean }) {
  const { w2, audit } = useReview();
  const cls = `inline-flex items-center gap-1.5 rounded-control px-2.5 py-1.5 text-xs font-medium transition-colors ${
    emphasized
      ? "bg-ink text-white hover:bg-accent"
      : "border border-line text-ink-2 hover:bg-paper"
  }`;

  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => downloadJSON(w2, audit)} className={cls}>
        <DownloadIcon />
        JSON
      </button>
      <button type="button" onClick={() => downloadCSV(w2)} className={cls}>
        <DownloadIcon />
        CSV
      </button>
      <button
        type="button"
        onClick={() => downloadEFW2(w2)}
        className={cls}
        title="SSA electronic-filing record (RW/RS): the layout tax software and the SSA consume"
      >
        <DownloadIcon />
        EFW2
      </button>
      <button
        type="button"
        onClick={() => downloadFieldMap(w2)}
        className={cls}
        title="Plain-English map of each box to where it lands on the 1040 / state return"
      >
        <DownloadIcon />
        Import map
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
