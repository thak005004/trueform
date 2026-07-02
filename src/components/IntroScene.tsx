"use client";

import { useRef } from "react";
import { DropZone } from "./DropZone";
import { useDocument, usePacket } from "@/state/document-context";
import { parseSession } from "@/state/session-file";

// The three trust pillars, surfaced as a feature row so the value prop reads like
// a product, not a tagline. These ladder directly to the thesis.
const PILLARS = [
  {
    key: "math",
    title: "Verifiable tax math",
    desc: "Every box re-checked against the IRS formulas for the tax year.",
  },
  {
    key: "reads",
    title: "Two independent reads",
    desc: "A separate OCR pass confirms the key numbers — not the model's own say-so.",
  },
  {
    key: "source",
    title: "Source-linked",
    desc: "Every value traces back to its exact spot on the page.",
  },
] as const;

// Bundled synthetic W-2s (different people/employers/amounts) so a reviewer can try
// the whole flow without a document of their own — each exercises a different part
// of the trust layer.
const SAMPLES = [
  { url: "/samples/w2-clean.pdf", name: "sample-w2-clean.pdf", label: "Clean W-2", note: "Passes every tax-math check", type: "application/pdf" },
  { url: "/samples/w2-transposed-box4.pdf", name: "sample-box4-error.pdf", label: "Box 4 error", note: "Transposed digit — math catches it", type: "application/pdf" },
  { url: "/samples/w2-high-earner.pdf", name: "sample-high-earner.pdf", label: "High earner", note: "$250k — Additional Medicare surtax", type: "application/pdf" },
  { url: "/samples/w2-roth.pdf", name: "sample-roth-401k.pdf", label: "Roth 401(k)", note: "Post-tax — no false deferral flag", type: "application/pdf" },
  { url: "/samples/w2-multistate.pdf", name: "sample-multistate.pdf", label: "Multi-state", note: "Two state rows (CA + NY)", type: "application/pdf" },
  { url: "/samples/w2-messy.jpg", name: "sample-messy-scan.jpg", label: "Messy scan", note: "Bad scan — low-confidence banner", type: "image/jpeg" },
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

  async function fetchSample(url: string, name: string, type = "application/pdf"): Promise<File> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Sample not found (${res.status}).`);
    return new File([await res.blob()], name, { type });
  }

  async function loadSample(url: string, name: string, type: string) {
    try {
      loadFile(await fetchSample(url, name, type));
    } catch {
      alert("Couldn't load that sample — please try uploading a file instead.");
    }
  }

  // Load a 2-year packet (2024 + 2025, same person) to demo prior-year comparison.
  async function loadPriorYearPacket() {
    try {
      const files = await Promise.all([
        fetchSample("/samples/w2-clean.pdf", "sample-w2-2025.pdf"),
        fetchSample("/samples/w2-2024-prior.pdf", "sample-w2-2024.pdf"),
      ]);
      loadFiles(files);
    } catch {
      alert("Couldn't load the sample packet — please try uploading files instead.");
    }
  }

  return (
    <div className="flex h-full flex-col items-center overflow-auto bg-[radial-gradient(120%_100%_at_50%_0%,var(--surface),var(--paper)_55%)] px-6 py-10">
      <div className="my-auto flex w-full max-w-2xl flex-col items-center text-center">
        <p
          className="figure animate-rise text-sm font-medium uppercase tracking-[0.18em] text-ink-2"
          style={{ animationDelay: "0ms" }}
        >
          W-2 extraction &amp; review
        </p>
        <h1
          className="animate-rise mt-3 text-3xl font-semibold leading-tight tracking-tight text-balance text-ink sm:text-4xl"
          style={{ animationDelay: "60ms" }}
        >
          Turn a W-2 into data you can trust.
        </h1>
        <p
          className="animate-rise mt-4 max-w-lg text-lg text-pretty text-ink-2"
          style={{ animationDelay: "120ms" }}
        >
          Upload a client&rsquo;s W-2s to begin. TrueForm extracts every box, checks
          the tax math, and flags exactly what to verify.
        </p>

        <div className="animate-rise mt-9 w-full max-w-xl" style={{ animationDelay: "180ms" }}>
          <DropZone />
        </div>

        <div
          className="animate-rise mt-8 grid w-full grid-cols-1 gap-3 sm:grid-cols-3"
          style={{ animationDelay: "240ms" }}
        >
          {PILLARS.map((p) => (
            <div key={p.key} className="rounded-xl border border-line bg-surface p-4 text-left">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-paper text-accent">
                <PillarIcon name={p.key} />
              </div>
              <p className="mt-3 text-base font-semibold text-ink">{p.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-2">{p.desc}</p>
            </div>
          ))}
        </div>

        {/* No W-2 handy? Load a bundled sample and see the whole flow. Each sample
            names the part of the trust layer it exercises. */}
        <div
          className="animate-rise mt-8 w-full rounded-2xl border border-line bg-surface p-5 text-left shadow-sm"
          style={{ animationDelay: "300ms" }}
        >
          <p className="text-sm font-semibold uppercase tracking-wider text-ink-2">
            No W-2 handy? Try a sample
          </p>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {SAMPLES.map((s) => (
              <button
                key={s.url}
                type="button"
                onClick={() => loadSample(s.url, s.name, s.type)}
                className="group flex flex-col rounded-lg border border-line bg-paper px-3 py-2 text-left transition-colors hover:border-accent hover:bg-surface"
              >
                <span className="text-base font-semibold text-ink transition-colors group-hover:text-accent">
                  {s.label}
                </span>
                <span className="mt-0.5 text-sm text-ink-2">{s.note}</span>
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={loadPriorYearPacket}
              className="text-base font-medium text-accent underline-offset-2 hover:underline"
            >
              Load a 2-year packet → prior-year comparison
            </button>
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
              className="text-sm text-ink-2 underline-offset-2 hover:text-ink hover:underline"
            >
              Open a saved review
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** One line-icon per trust pillar. */
function PillarIcon({ name }: { name: "math" | "reads" | "source" }) {
  const common = {
    width: 17,
    height: 17,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (name === "math") {
    // shield-check — verified against the rules
    return (
      <svg {...common}>
        <path d="M12 3 4 6v6c0 4.5 3.4 7.6 8 9 4.6-1.4 8-4.5 8-9V6l-8-3Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    );
  }
  if (name === "reads") {
    // two overlapping pages — a second, independent read
    return (
      <svg {...common}>
        <rect x="4" y="4" width="12" height="14" rx="1.5" />
        <path d="M8 20h10a1.5 1.5 0 0 0 1.5-1.5V8" />
      </svg>
    );
  }
  // crosshair — traced to a spot on the page
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
