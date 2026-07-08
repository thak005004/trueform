"use client";

import { useEffect, useRef } from "react";
import type { RenderedPage } from "@/render/renderDocument";
import type { Bbox } from "@/review/fields";

export interface Highlight {
  page: number;
  bbox: Bbox | null;
}

/**
 * The document pane. Renders page rasters as cards and, when a field is selected,
 * highlights where its value was read from.
 *
 * The model's source bbox is only APPROXIMATE — vision models don't localize to
 * the pixel, and a tight rectangle that lands off the value reads as broken and
 * quietly erodes trust (worse than no box). So we don't draw the raw box: we
 * highlight the horizontal BAND the value sits in (full width, at the model's
 * vertical position) and label it "approx." A strip is much likelier to actually
 * cover the value, and it reads honestly as "around here" instead of claiming a
 * precision the model doesn't have. bbox is normalized 0..1, positioned with
 * percentages so it's correct at any displayed size.
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
            {highlight?.bbox && highlight.page === i && (() => {
              // Pad the band around the model's y so an off-by-a-line bbox still
              // covers the true value; clamp to the page.
              const b = highlight.bbox;
              const pad = Math.max(b.height * 0.6, 0.012);
              const top = Math.max(b.y - pad, 0);
              const bottom = Math.min(b.y + b.height + pad, 1);
              return (
                <div
                  ref={overlayRef}
                  className="pointer-events-none absolute left-[2%] right-[2%] rounded-[3px]"
                  style={{
                    top: `${top * 100}%`,
                    height: `${(bottom - top) * 100}%`,
                    outline: "2px dashed var(--accent)",
                    outlineOffset: "1px",
                    background: "color-mix(in oklab, var(--accent) 10%, transparent)",
                  }}
                >
                  <span
                    className="figure absolute left-1.5 top-1 rounded-sm px-1 py-px text-[9px] font-medium uppercase tracking-wide text-white"
                    style={{ background: "var(--accent)" }}
                  >
                    approx. source
                  </span>
                </div>
              );
            })()}
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
