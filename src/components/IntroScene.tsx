"use client";

import { useRef } from "react";
import { DropZone } from "./DropZone";
import { useDocument, usePacket } from "@/state/document-context";
import { parseSession } from "@/state/session-file";

// The three trust pillars, surfaced quietly so the value prop is visible before
// the user has uploaded anything. These ladder directly to the product thesis.
const PILLARS = [
  "Verifiable tax math",
  "Two independent reads",
  "Source-linked to the page",
];

// Bundled synthetic W-2s so a reviewer can try the whole flow without a document
// of their own. One clean, one with a transposed Box 4 (the tax math catches it).
const SAMPLES = [
  { url: "/samples/w2-clean.pdf", name: "sample-w2-clean.pdf", label: "Clean W-2" },
  { url: "/samples/w2-transposed-box4.pdf", name: "sample-w2-box4-error.pdf", label: "With a Box 4 error" },
];

/**
 * The idle "intro scene": a centered hero that frames what TrueForm does, with the
 * upload drop zone as the centerpiece. Elements fade-and-rise in sequence. All
 * neutral ink-on-paper — the only color is the deep-navy accent on interaction.
 */
export function IntroScene() {
  const { loadFile } = useDocument();
  const { loadFiles, restore } = usePacket();
  const openRef = useRef<HTMLInputElement>(null);

  async function onOpenSession(file: File | undefined) {
    if (!file) return;
    try {
      const s = parseSession(await file.text());
      restore(s.documents, s.activeId, s.view);
    } catch {
      alert("Couldn't open that file — it isn't a TrueForm session.");
    }
  }

  async function fetchSample(url: string, name: string): Promise<File> {
    const res = await fetch(url);
    return new File([await res.blob()], name, { type: "application/pdf" });
  }

  async function loadSample(url: string, name: string) {
    loadFile(await fetchSample(url, name));
  }

  // Load a 2-year packet (2024 + 2025, same person) to demo prior-year comparison.
  async function loadPriorYearPacket() {
    const files = await Promise.all([
      fetchSample("/samples/w2-clean.pdf", "sample-w2-2025.pdf"),
      fetchSample("/samples/w2-2024-prior.pdf", "sample-w2-2024.pdf"),
    ]);
    loadFiles(files);
  }

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

        {/* No W-2 handy? Load a bundled sample and see the whole flow. */}
        <div
          className="animate-rise mt-6 flex flex-col items-center gap-2 text-xs text-ink-3"
          style={{ animationDelay: "300ms" }}
        >
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
            <span>No W-2 handy? Try a sample:</span>
            {SAMPLES.map((s, i) => (
              <span key={s.url} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => loadSample(s.url, s.name)}
                  className="font-medium text-accent underline-offset-2 hover:underline"
                >
                  {s.label}
                </button>
                {i < SAMPLES.length - 1 && <span className="text-line">·</span>}
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={loadPriorYearPacket}
            className="font-medium text-accent underline-offset-2 hover:underline"
          >
            Or load a 2-year packet → see prior-year comparison
          </button>
          <div>
            <input
              ref={openRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                onOpenSession(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => openRef.current?.click()}
              className="text-ink-3 underline-offset-2 hover:text-ink-2 hover:underline"
            >
              Open a saved review
            </button>
          </div>
        </div>
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
