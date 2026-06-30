"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import { buildGroups, type FieldDef } from "@/review/fields";
import { useReview, type FieldStatus } from "@/review/review-context";
import { FieldRow } from "./FieldRow";
import { ExportButtons } from "./ExportButtons";

const PRIORITY: Record<FieldStatus, number> = {
  error: 0,
  review: 1,
  verified: 2,
  neutral: 2,
};

export function ReviewPanel() {
  const {
    w2,
    validation,
    confirmed,
    selected,
    effectiveStatus,
    crossReadStatus,
    select,
    focusPath,
    startEdit,
    toggleConfirm,
  } = useReview();

  // Build groups for the current W-2 and sort each so flagged fields surface first.
  const groups = useMemo(() => {
    return buildGroups(w2).map((g) => ({
      title: g.title,
      fields: g.fields
        .map((f, idx) => ({ f, idx, st: effectiveStatus(f.path) }))
        .sort((a, b) => PRIORITY[a.st] - PRIORITY[b.st] || a.idx - b.idx)
        .map((x) => x.f),
    }));
  }, [w2, effectiveStatus]);

  // Flat display order — drives the keyboard loop (read directly by the handler).
  const orderedPaths = useMemo(
    () => groups.flatMap((g) => g.fields.map((f) => f.path)),
    [groups],
  );

  // Triage counts over the rendered fields via effectiveStatus, so they reflect
  // math validation, confirmations, AND cross-read disagreements uniformly.
  const { errors, reviews, verified, ready } = useMemo(() => {
    let e = 0;
    let w = 0;
    for (const path of orderedPaths) {
      const s = effectiveStatus(path);
      if (s === "error") e++;
      else if (s === "review") w++;
    }
    return { errors: e, reviews: w, verified: confirmed.size, ready: e === 0 && w === 0 };
  }, [orderedPaths, effectiveStatus, confirmed]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).tagName === "INPUT") return; // editing owns its keys
    if (orderedPaths.length === 0) return;
    const idx = selected ? orderedPaths.indexOf(selected) : -1;

    const goto = (p: string) => {
      select(p);
      focusPath(p);
    };
    const move = (d: number) =>
      goto(orderedPaths[idx < 0 ? 0 : (idx + d + orderedPaths.length) % orderedPaths.length]);

    switch (e.key) {
      case "ArrowDown":
      case "j":
        e.preventDefault();
        move(1);
        break;
      case "ArrowUp":
      case "k":
        e.preventDefault();
        move(-1);
        break;
      case "n":
      case "N": {
        e.preventDefault();
        for (let s = 1; s <= orderedPaths.length; s++) {
          const p = orderedPaths[(idx + s + orderedPaths.length) % orderedPaths.length];
          const st = effectiveStatus(p);
          if (st === "error" || st === "review") {
            goto(p);
            break;
          }
        }
        break;
      }
      case "e":
      case "Enter":
        if (selected) {
          e.preventDefault();
          startEdit(selected);
        }
        break;
      case "c":
        if (selected) {
          e.preventDefault();
          toggleConfirm(selected);
        }
        break;
    }
  }

  return (
    <div onKeyDown={onKeyDown} className="flex h-full flex-col">
      <SummaryBar
        errors={errors}
        reviews={reviews}
        verified={verified}
        ready={ready}
        taxYear={validation.resolvedTaxYear}
        taxYearExact={validation.taxYearExact}
        crossChecking={crossReadStatus === "running"}
      />

      <div className="flex-1">
        {groups.map((g) => (
          <section key={g.title} className="border-b border-line px-3 py-3 last:border-b-0">
            <h3 className="mb-1.5 px-1 text-xs font-medium text-ink-3">{g.title}</h3>
            <div className="flex flex-col">
              {g.fields.map((f: FieldDef) => (
                <FieldRow key={f.path} field={f} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <AuditTrail />
    </div>
  );
}

function SummaryBar({
  errors,
  reviews,
  verified,
  ready,
  taxYear,
  taxYearExact,
  crossChecking,
}: {
  errors: number;
  reviews: number;
  verified: number;
  ready: boolean;
  taxYear: number;
  taxYearExact: boolean;
  crossChecking: boolean;
}) {
  return (
    <div className="sticky top-0 z-10 border-b border-line bg-surface px-4 py-3">
      <div className="figure flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="text-error">{errors} errors</span>
        <span className="text-review">{reviews} need review</span>
        <span className="text-verified">{verified} verified</span>
        <span className="ml-auto text-ink-3">
          {crossChecking ? "second read…" : `tax year ${taxYear}${taxYearExact ? "" : " (fallback)"}`}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        {ready ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
            style={{ background: "var(--verified-bg)", color: "var(--verified)" }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m5 12 5 5L20 7" />
            </svg>
            Ready to export
          </span>
        ) : (
          <span className="text-xs text-ink-3">Resolve flags to finish</span>
        )}
        <ExportButtons emphasized={ready} />
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-[10px] text-ink-3">
          Box-keyed structured output for downstream tax software
        </span>
        <KeyboardLegend />
      </div>
    </div>
  );
}

const SHORTCUTS: [string, string][] = [
  ["↑ ↓ / j k", "Move between fields"],
  ["n", "Jump to next flag"],
  ["e / ↵", "Edit field"],
  ["c", "Confirm field"],
  ["esc", "Cancel edit"],
];

/** Discoverable "?" affordance that reveals the keyboard loop. */
function KeyboardLegend() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Keyboard shortcuts"
        aria-expanded={open}
        className="flex h-5 w-5 items-center justify-center rounded-full border border-line text-[11px] text-ink-3 hover:border-ink-3 hover:text-ink-2"
      >
        ?
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1.5 w-56 rounded-card border border-line bg-surface p-2.5 shadow-[0_4px_16px_rgba(22,32,46,0.12)]">
          <div className="mb-1.5 text-[10px] uppercase tracking-wide text-ink-3">
            Keyboard
          </div>
          <ul className="flex flex-col gap-1">
            {SHORTCUTS.map(([key, desc]) => (
              <li key={key} className="flex items-center justify-between gap-3 text-xs">
                <span className="text-ink-2">{desc}</span>
                <kbd className="figure rounded border border-line bg-paper px-1.5 py-0.5 text-[10px] text-ink-2">
                  {key}
                </kbd>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function AuditTrail() {
  const { audit } = useReview();
  const [open, setOpen] = useState(false);
  const n = audit.length;

  return (
    <div className="border-t border-line bg-surface px-4 py-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="figure flex w-full items-center gap-1.5 text-xs text-ink-2"
      >
        <span className="text-ink-3">{open ? "▾" : "▸"}</span>
        {n} {n === 1 ? "change" : "changes"}
      </button>
      {open && n > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {audit.map((a, i) => (
            <li key={i} className="figure text-[11px] leading-snug text-ink-3">
              <span className="text-ink-2">{a.field}</span>{" "}
              {a.action === "edit" ? (
                <>
                  {a.oldValue} → <span className="text-ink">{a.newValue}</span>
                </>
              ) : (
                <span style={{ color: "var(--verified)" }}>confirmed</span>
              )}
              <span className="ml-1 text-ink-3">
                · {new Date(a.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
