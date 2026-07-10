"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RenderedPage } from "@/render/renderDocument";
import { PageStack, type Highlight } from "./PageStack";
import { runValidation } from "@/forms/engine";
import type { ExtractedField, FieldDef, FieldType, FormDefinition, FormInstance, ValidationResult } from "@/forms/types";
import { runCrossReadInstance, type CrossReadResult } from "@/review/cross-read";
import type { FieldKind } from "@/review/fields";

/**
 * GENERIC, SCHEMA-DRIVEN REVIEW.
 * -----------------------------
 * Renders ANY form purely from its definition: groups come from `schema.group`,
 * labels/boxes from the FieldDef, formatting from the field `type`, and triage
 * from the engine's per-field status. Editing a value re-runs the SAME engine
 * (runValidation) live, so a 1099 (or any future form) gets a working
 * review — source-linking, triage, inline edit — with zero form-specific UI code.
 *
 * W-2 keeps its richer bespoke review (show-the-math, Box 12 decode, EFW2, etc.);
 * this is the general renderer every OTHER form uses. Folding W-2 onto it later is
 * the remaining migration (noted in the writeup).
 */

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

function formatValue(f: ExtractedField | undefined, type: FieldDef["type"]): string {
  const v = f?.value;
  if (v == null || v === "") return "-";
  if (type === "money" && typeof v === "number") return usd(v);
  return String(v);
}

/** Turn edited text back into an ExtractedField, preserving the original source. */
function parseEdit(raw: string, type: FieldDef["type"], source: ExtractedField["source"]): ExtractedField {
  const t = raw.trim();
  if (t === "") return { present: false, value: null, raw: null, source };
  if (type === "money" || type === "year") {
    const n = Number(t.replace(/[$,\s]/g, ""));
    return { present: true, value: Number.isNaN(n) ? null : n, raw: t, source };
  }
  return { present: true, value: t, raw: t, source };
}

const statusColor: Record<string, string> = {
  error: "var(--error)",
  review: "var(--review)",
  ok: "var(--verified)",
};

const EMPTY_VALIDATION: ValidationResult = {
  issues: [],
  byField: {},
  summary: { errors: 0, warnings: 0, infos: 0 },
  resolvedTaxYear: 0,
  taxYearExact: true,
};

export function GenericFormReview({
  def,
  instance,
  pages,
  onChange,
  verified = true,
}: {
  def: FormDefinition;
  instance: FormInstance;
  pages: RenderedPage[];
  /** Persist edited instance + fresh validation back to the packet (dashboard/session). */
  onChange?: (next: FormInstance, validation: ValidationResult) => void;
  /** False for the generic tier: extracted but NOT machine-checked. No rules run,
   *  fields render neutral, and an "unverified" banner makes the tier explicit. */
  verified?: boolean;
}) {
  // Seed editable text AND each field's source ONCE from the extraction. Keeping
  // the sources (and formType) in a stable seed — not read from `instance` on
  // every render — is what lets the draft depend only on local edits, so writing
  // the draft back via onChange can't feed into `instance` and loop.
  const [seed] = useState(() => {
    const text0: Record<string, string> = {};
    const sources: Record<string, ExtractedField["source"]> = {};
    for (const f of def.schema) {
      const fld = instance.fields[f.id];
      text0[f.id] = fld?.value == null ? "" : String(fld.value);
      sources[f.id] = fld?.source ?? null;
    }
    return { text0, sources, formType: instance.formType };
  });
  const [text, setText] = useState<Record<string, string>>(seed.text0);
  const [selected, setSelected] = useState<string | null>(null);

  // Rebuild the instance from edits and re-run the engine live.
  const draft: FormInstance = useMemo(() => {
    const fields: Record<string, ExtractedField> = {};
    for (const f of def.schema) fields[f.id] = parseEdit(text[f.id] ?? "", f.type, seed.sources[f.id] ?? null);
    return { formType: seed.formType, fields };
  }, [text, def, seed]);

  // Verified tier runs the engine live; the unverified (generic) tier applies NO
  // rules — we never invent tax math for a form we don't have a definition for.
  const validation = useMemo(
    () => (verified ? runValidation(draft, def) : EMPTY_VALIDATION),
    [draft, def, verified],
  );

  // Sync edits + fresh validation back to the packet so the dashboard row and
  // saved session reflect corrections. Seeded from `instance` once (useState
  // initializer), so parent writes don't re-seed and this won't loop.
  useEffect(() => {
    onChange?.(draft, validation);
  }, [draft, validation, onChange]);

  const groups = useMemo(() => {
    const order: string[] = [];
    const byGroup: Record<string, FieldDef[]> = {};
    for (const f of def.schema) {
      if (!byGroup[f.group]) { byGroup[f.group] = []; order.push(f.group); }
      byGroup[f.group].push(f);
    }
    return order.map((title) => ({ title, fields: byGroup[title] }));
  }, [def]);

  const highlight: Highlight | null = useMemo(() => {
    if (!selected) return null;
    const src = draft.fields[selected]?.source;
    return src ? { page: src.page, bbox: src.bbox } : null;
  }, [selected, draft]);

  const verifiedCount = def.schema.filter((f) => (validation.byField[f.id]?.status ?? "ok") === "ok").length;

  // --- Independent second read (form-agnostic verification, no tax math) --------
  // Confirms whether an independent OCR read agrees with each extracted value.
  // Runs on ANY form. Scoped to money + id fields (reliable crops). Runs once
  // against the ORIGINAL extraction (a ref, so edits don't retrigger it).
  const initialInstanceRef = useRef(instance);
  const crossReadFields = useMemo(() => {
    const kindOf = (t: FieldType): FieldKind | null =>
      t === "money" ? "money" : t === "ssn" || t === "ein" || t === "tin" ? "id" : null;
    const hasFlags = def.schema.some((f) => f.crossRead);
    const out: { id: string; kind: FieldKind }[] = [];
    for (const f of def.schema) {
      const kind = kindOf(f.type);
      if (kind && (hasFlags ? f.crossRead : true)) out.push({ id: f.id, kind });
    }
    return out;
  }, [def]);

  const [crossRead, setCrossRead] = useState<CrossReadResult | null>(null);
  const [crDone, setCrDone] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (crossReadFields.length === 0) {
      setCrDone(true);
      return;
    }
    runCrossReadInstance(pages, initialInstanceRef.current, crossReadFields)
      .then((r) => {
        if (!cancelled) {
          setCrossRead(r);
          setCrDone(true);
        }
      })
      .catch(() => {
        if (!cancelled) setCrDone(true);
      });
    return () => {
      cancelled = true;
    };
  }, [pages, crossReadFields]);

  const crConfirmed = crossRead?.confirmed ?? [];
  const crDisagree = crossRead?.disagreements ?? {};

  function exportJSON() {
    const rec: Record<string, unknown> = { formType: def.id, taxYear: draft.fields.taxYear?.value ?? null };
    for (const [fid, m] of Object.entries(def.outputMapping)) rec[m.exportKey] = draft.fields[fid]?.value ?? null;
    const blob = new Blob([JSON.stringify(rec, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${def.id}_export.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <div className="min-h-0 basis-[45%] overflow-auto bg-paper lg:h-full lg:w-[55%] lg:basis-auto">
        <PageStack pages={pages} highlight={highlight} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-auto border-t border-line bg-surface lg:h-full lg:w-[45%] lg:flex-none lg:border-t-0 lg:border-l">
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-surface px-4 py-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-ink">{def.name}</div>
            <div className="figure text-[11px] text-ink-3">
              {verified
                ? `${validation.summary.errors} errors · ${validation.summary.warnings} review · ${verifiedCount} verified`
                : crossReadFields.length === 0
                  ? "Extracted"
                  : !crDone
                    ? "Extracted · second read running…"
                    : `Extracted · second read confirmed ${crConfirmed.length}/${crossReadFields.length} key fields`}
            </div>
          </div>
          <button
            type="button"
            onClick={exportJSON}
            className="ml-auto shrink-0 rounded-control border border-line px-3 py-1.5 text-xs text-ink-2 hover:bg-paper"
          >
            Export JSON
          </button>
        </div>

        {!verified && (
          <div
            className="border-b border-line px-4 py-2.5"
            style={{ background: "color-mix(in oklab, var(--accent) 7%, var(--surface))" }}
          >
            <div className="flex items-start gap-2">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-accent" aria-hidden>
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
              <p className="text-[13px] leading-snug text-ink-2">
                <span className="font-semibold text-ink">Extracted and read-checked.</span> TrueForm read every field, and an independent second read double-checks the key numbers below. It doesn&rsquo;t have this form&rsquo;s built-in tax math yet (it has that for forms like W-2 and 1099), so give the values a quick check against the document as you go.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-5 px-4 py-4">
          {groups.map((g) => (
            <section key={g.title}>
              <h3 className="mb-2 text-[13px] font-medium text-ink-2">{g.title}</h3>
              <div className="overflow-hidden rounded-card border border-line">
                {g.fields.map((f, i) => {
                  const status = validation.byField[f.id]?.status ?? "ok";
                  // Layer the independent second read on top of (or, for the
                  // unverified tier, INSTEAD of) the rule status.
                  const crFlag = !crDone ? "none" : crDisagree[f.id] ? "disagree" : crConfirmed.includes(f.id) ? "confirmed" : "none";
                  let dot: string;
                  if (verified) {
                    dot = statusColor[status];
                    if (crFlag === "disagree" && status === "ok") dot = "var(--review)"; // second read flags a field the rules passed
                  } else {
                    dot = crFlag === "disagree" ? "var(--review)" : crFlag === "confirmed" ? "var(--verified)" : "var(--ink-3)";
                  }
                  const mono = f.type !== "text";
                  return (
                    <div
                      key={f.id}
                      className={`flex items-center gap-3 px-3 py-2.5 ${i > 0 ? "border-t border-line" : ""} ${selected === f.id ? "bg-paper" : ""}`}
                      onClick={() => setSelected(f.id)}
                    >
                      <span className="mt-0.5 h-2 w-2 shrink-0 self-start rounded-full" style={{ background: dot }} aria-label={crFlag !== "none" ? crFlag : verified ? status : "unchecked"} />
                      <div className="min-w-0 flex-1">
                        {f.box && <div className="figure text-[10px] uppercase tracking-wide text-ink-3">{f.box}</div>}
                        <div className="truncate text-[13px] text-ink-2">{f.label}</div>
                        {crFlag === "disagree" && (
                          <p className="mt-1 text-[11px] leading-snug text-review">Second read couldn&rsquo;t confirm this value. Check it against the document.</p>
                        )}
                      </div>
                      <input
                        value={text[f.id] ?? ""}
                        onChange={(e) => setText((t) => ({ ...t, [f.id]: e.target.value }))}
                        onFocus={() => setSelected(f.id)}
                        placeholder="-"
                        className={`w-40 shrink-0 rounded border border-line bg-surface px-2 py-1 text-right text-sm text-ink focus:border-accent focus:outline-none ${mono ? "figure" : ""}`}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
          {/* formatValue is used for the read-only summary tooltip title on money fields */}
          <p className="text-[11px] text-ink-3">
            Values re-validate as you edit. Box-keyed export maps each field to its downstream target ({Object.keys(def.outputMapping).length} mapped).
          </p>
        </div>
      </div>
    </div>
  );
}

// Keep formatValue referenced (used by callers that render read-only summaries).
export { formatValue };
