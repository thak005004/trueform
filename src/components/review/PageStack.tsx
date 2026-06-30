"use client";

import { useEffect, useRef } from "react";
import type { RenderedPage } from "@/render/renderDocument";
import type { Bbox } from "@/review/fields";

export interface Highlight {
  page: number;
  bbox: Bbox | null;
}

/**
 * The document pane. Renders page rasters as cards (as before) and, when a field
 * is selected, draws a generously-padded accent overlay on its source bbox.
 * bbox is normalized 0..1, so we position with percentages — correct at any
 * displayed size. Model bboxes are approximate, hence the outline-offset padding.
 */
export function PageStack({
  pages,
  highlight,
}: {
  pages: RenderedPage[];
  highlight?: Highlight | null;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlight?.bbox) {
      overlayRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [highlight]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 py-6 sm:px-6">
      {pages.map((page, i) => (
        <figure
          key={i}
          className="w-full overflow-hidden rounded-card border border-line bg-surface shadow-[0_1px_3px_rgba(22,32,46,0.08)]"
        >
          {/* The overlay is positioned against THIS box, which wraps only the
              image — so bbox percentages (normalized to the page image) map
              correctly and aren't skewed by the caption bar's height. */}
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- client-rendered data: URL */}
            <img
              src={page.dataUrl}
              alt={`Document page ${i + 1}`}
              width={page.width}
              height={page.height}
              className="block w-full"
            />
            {highlight?.bbox && highlight.page === i && (
              <div
                ref={overlayRef}
                className="pointer-events-none absolute rounded-[2px]"
                style={{
                  left: `${highlight.bbox.x * 100}%`,
                  top: `${highlight.bbox.y * 100}%`,
                  width: `${highlight.bbox.width * 100}%`,
                  height: `${highlight.bbox.height * 100}%`,
                  outline: "2px solid var(--accent)",
                  outlineOffset: "4px",
                  background: "color-mix(in oklab, var(--accent) 14%, transparent)",
                }}
              />
            )}
          </div>
          <figcaption className="figure flex items-center justify-between border-t border-line px-3 py-2 text-xs text-ink-3">
            <span>
              Page {i + 1} of {pages.length}
            </span>
            <span>
              {page.width}×{page.height}px
            </span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
