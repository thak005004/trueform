"use client";

import { DropZone } from "./DropZone";

// The three trust pillars, surfaced quietly so the value prop is visible before
// the user has uploaded anything. These ladder directly to the product thesis.
const PILLARS = [
  "Verifiable tax math",
  "Two independent reads",
  "Source-linked to the page",
];

/**
 * The idle "intro scene": a centered hero that frames what TrueForm does, with the
 * upload drop zone as the centerpiece. Elements fade-and-rise in sequence. All
 * neutral ink-on-paper — the only color is the deep-navy accent on interaction.
 */
export function IntroScene() {
  return (
    <div className="flex h-full flex-col items-center justify-center overflow-auto bg-[radial-gradient(120%_100%_at_50%_0%,var(--surface),var(--paper)_55%)] px-6 py-10">
      <div className="flex w-full max-w-xl flex-col items-center text-center">
        <p
          className="figure animate-rise text-[11px] uppercase tracking-[0.18em] text-ink-3"
          style={{ animationDelay: "0ms" }}
        >
          W-2 extraction
        </p>
        <h1
          className="animate-rise mt-3 text-3xl font-semibold leading-tight tracking-tight text-balance text-ink sm:text-4xl"
          style={{ animationDelay: "60ms" }}
        >
          Turn a W-2 into data you can trust.
        </h1>
        <p
          className="animate-rise mt-4 max-w-md text-base text-pretty text-ink-2"
          style={{ animationDelay: "120ms" }}
        >
          Upload a client&rsquo;s W-2s to begin. TrueForm extracts every box, checks
          the tax math, and flags exactly what to verify.
        </p>

        <div className="animate-rise mt-9 w-full" style={{ animationDelay: "180ms" }}>
          <DropZone />
        </div>

        <ul
          className="animate-rise mt-8 flex flex-wrap items-center justify-center gap-2"
          style={{ animationDelay: "240ms" }}
        >
          {PILLARS.map((pillar) => (
            <li
              key={pillar}
              className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink-2"
            >
              <CheckDot />
              {pillar}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function CheckDot() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-ink-3"
    >
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}
