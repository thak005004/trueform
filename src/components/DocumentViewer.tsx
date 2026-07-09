"use client";

import { useCallback, useEffect, useState } from "react";
import { useDocument, usePacket } from "@/state/document-context";
import type { FormInstance, ValidationResult } from "@/forms/types";
import { getForm } from "@/forms/registry";
import { IntroScene } from "./IntroScene";
import { PageStack } from "./review/PageStack";
import { ReviewLayout } from "./review/ReviewLayout";
import { GenericFormReview } from "./review/GenericFormReview";
import { UnidentifiedForm } from "./review/UnidentifiedForm";

/**
 * Top-level switch for the main pane:
 *   idle       → intro scene
 *   rendering  → spinner
 *   error      → render error
 *   ready      → document only (pre-extract), or the two-pane review once
 *                extraction has returned { extraction, validation }.
 */
export function DocumentViewer() {
  const { pages, status, error, extractStatus, extractError, result, extract } =
    useDocument();
  const { active, updateReview } = usePacket();

  // Stable so the generic renderer's persist-effect doesn't re-fire every render.
  const activeId = active?.id;
  const handleGenericChange = useCallback(
    (inst: FormInstance, val: ValidationResult) => {
      if (activeId) updateReview(activeId, { formInstance: inst, validation: val });
    },
    [activeId, updateReview],
  );

  if (status === "idle") return <IntroScene />;

  if (status === "rendering") {
    return (
      <Centered>
        <p className="animate-pulse text-ink-2">Rendering document…</p>
      </Centered>
    );
  }

  if (status === "error") {
    return (
      <Centered>
        <div className="max-w-md rounded-card border border-error/30 bg-error-bg px-4 py-3 text-center text-sm text-error">
          {error}
        </div>
      </Centered>
    );
  }

  // --- Route by the classifier's answer (once extraction has resolved) ---
  // Fail safe: an unidentified form goes to human review, never a guessed extract.
  if (active?.needsReview) return <UnidentifiedForm doc={active} />;

  // A known NON-W-2 form renders through the generic, schema-driven review.
  if (active && active.formType !== "w2" && active.formInstance) {
    const def = getForm(active.formType);
    if (def) {
      return (
        <GenericFormReview
          def={def}
          instance={active.formInstance}
          pages={active.pages}
          onChange={handleGenericChange}
        />
      );
    }
  }

  // W-2 keeps its rich bespoke review, unchanged.
  if (result) return <ReviewLayout />;

  return (
    <div className="h-full overflow-auto bg-paper">
      {extractStatus === "extracting" && <ExtractProgress />}
      {extractStatus === "error" && (
        <div className="px-4 pt-4">
          <div className="mx-auto flex max-w-3xl items-center gap-3 rounded-card border border-error/30 bg-error-bg px-4 py-3 text-sm text-error">
            <span className="flex-1">{extractError}</span>
            <button
              type="button"
              onClick={() => extract()}
              className="shrink-0 rounded-control border border-error/40 px-2.5 py-1 text-xs font-medium text-error hover:bg-surface"
            >
              Retry
            </button>
          </div>
        </div>
      )}
      <PageStack pages={pages} />
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center bg-paper p-6">
      {children}
    </div>
  );
}

/**
 * Staged progress shown while a document extracts — reveals the real pipeline
 * order instead of a dead spinner. Rendering is done by now; the request does a
 * vision read and then the server validates the tax math, so we advance from
 * "Reading" to "Checking the tax math" partway through the call. (The independent
 * second read runs later, in the review, with its own indicator there.)
 */
function ExtractProgress() {
  // Advance from the vision read to the math check partway through the request.
  const [phase, setPhase] = useState<0 | 1>(0);
  useEffect(() => {
    const t = setTimeout(() => setPhase(1), 11000);
    return () => clearTimeout(t);
  }, []);

  const STEPS = [
    { label: "Rendered", state: "done" as const },
    { label: "Reading the form", state: phase >= 1 ? ("done" as const) : ("active" as const) },
    { label: "Checking the tax math", state: phase >= 1 ? ("active" as const) : ("pending" as const) },
  ];
  const color = (s: string) =>
    s === "done" ? "var(--verified)" : s === "active" ? "var(--accent)" : "var(--ink-3)";

  return (
    <div className="sticky top-0 z-10 border-b border-line bg-surface px-4 py-4">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-2 gap-y-2 text-sm sm:text-[15px]">
        {STEPS.map((s, i) => (
          <div key={s.label} className="flex items-center gap-2">
            {s.state === "active" ? (
              <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" style={{ color: color(s.state) }} aria-hidden>
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            ) : s.state === "done" ? (
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={color(s.state)} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m5 12 5 5L20 7" />
              </svg>
            ) : (
              <span className="h-2 w-2 rounded-full" style={{ background: color(s.state) }} />
            )}
            <span className={s.state === "active" ? "font-medium" : ""} style={{ color: color(s.state) }}>
              {s.label}
            </span>
            {i < STEPS.length - 1 && <span className="mx-1 hidden h-px w-8 bg-line sm:block sm:w-12" />}
          </div>
        ))}
      </div>
    </div>
  );
}
