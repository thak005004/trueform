"use client";

import { useMemo } from "react";
import { useDocument } from "@/state/document-context";
import { ReviewProvider, useReview } from "@/review/review-context";
import { getByPath } from "@/review/fields";
import { PageStack, type Highlight } from "./PageStack";
import { ReviewPanel } from "./ReviewPanel";

/**
 * The two-pane review experience. Left = document (source of truth) with the
 * selected field's bbox highlighted. Right = grouped, triageable fields.
 * Keyed on resultVersion so a re-extract starts the review state fresh.
 */
export function ReviewLayout() {
  const { result, resultVersion } = useDocument();
  if (!result) return null;
  return (
    <ReviewProvider key={resultVersion} result={result}>
      <ReviewLayoutInner />
    </ReviewProvider>
  );
}

function ReviewLayoutInner() {
  const { pages } = useDocument();
  const r = useReview();

  const highlight: Highlight | null = useMemo(() => {
    if (!r.selected) return null;
    const src = getByPath(r.w2, r.selected)?.source;
    if (!src) return null;
    return { page: src.page, bbox: src.bbox };
  }, [r.selected, r.w2]);

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <div className="min-h-0 basis-[45%] overflow-auto bg-paper lg:h-full lg:w-[55%] lg:basis-auto">
        <PageStack pages={pages} highlight={highlight} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto border-t border-line bg-surface lg:h-full lg:w-[45%] lg:flex-none lg:border-t-0 lg:border-l">
        <ReviewPanel />
      </div>
    </div>
  );
}
