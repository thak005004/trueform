"use client";

import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  editInitial,
  formatValue,
  getByPath,
  isMono,
  type FieldDef,
} from "@/review/fields";
import { useReview, type FieldStatus } from "@/review/review-context";

const SPINE: Record<FieldStatus, string> = {
  error: "var(--error)",
  review: "var(--review)",
  verified: "var(--verified)",
  neutral: "var(--line)",
};

export function FieldRow({ field }: { field: FieldDef }) {
  const r = useReview();
  const fieldObj = getByPath(r.w2, field.path);
  const status = r.effectiveStatus(field.path);
  const issues = r.validation.byField[field.path]?.issues ?? [];
  const isSelected = r.selected === field.path;
  const isEditing = r.editing === field.path;
  const isConfirmed = r.confirmed.has(field.path);
  const edited = r.isEdited(field.path);
  const disagreement = r.disagreementFor(field.path);
  const mono = isMono(field.kind);
  const blank = fieldObj?.value == null;

  return (
    <div
      ref={(el) => r.registerRow(field.path, el)}
      tabIndex={0}
      onClick={() => r.select(field.path)}
      onFocus={() => r.select(field.path)}
      className={`group relative rounded-md py-2 pl-4 pr-2 outline-none transition-colors ${
        isSelected ? "bg-[color-mix(in_oklab,var(--accent)_4%,transparent)]" : "hover:bg-paper"
      }`}
    >
      {/* status spine (3px) */}
      <span
        aria-hidden
        className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full"
        style={{ background: SPINE[status] }}
      />

      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {/* quiet meta line: box eyebrow + label (+ edited pill) */}
          <div className="flex items-center gap-2">
            {field.box && (
              <span className="figure text-[10px] uppercase tracking-wide text-ink-3">
                {field.box}
              </span>
            )}
            <span className="truncate text-[11px] text-ink-3">{field.label}</span>
            {edited && (
              <span className="ml-auto shrink-0 rounded-full border border-line bg-paper px-1.5 py-px text-[10px] text-ink-3">
                edited
              </span>
            )}
          </div>

          {/* value — the primary thing on the row */}
          {isEditing ? (
            <EditInput field={field} initial={editInitial(fieldObj)} mono={mono} />
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                r.startEdit(field.path);
              }}
              className={`mt-0.5 block w-full truncate rounded text-left text-[15px] leading-snug hover:bg-paper ${
                mono ? "figure" : ""
              } ${blank ? "text-ink-3" : "font-medium text-ink"}`}
              title="Click to edit"
            >
              {formatValue(fieldObj, field.kind)}
            </button>
          )}

          {/* edited marker: show the original, struck through */}
          {edited && !isEditing && (
            <p className="mt-0.5 text-[11px] text-ink-3">
              was <span className="line-through">{r.originalText(field.path, field.kind)}</span>
            </p>
          )}

          {/* issue messages — muted once the field is confirmed */}
          {issues.map((iss, k) => (
            <p
              key={k}
              className="mt-1 text-xs"
              style={{ color: messageColor(iss.severity, isConfirmed) }}
            >
              {iss.message}
            </p>
          ))}

          {/* cross-read disagreement: two independent reads differ — show both, let the preparer pick */}
          {disagreement && (
            <div
              className="mt-1.5 rounded-md px-2 py-1.5"
              style={{ background: "var(--review-bg)" }}
            >
              <p className="text-[11px] font-medium" style={{ color: "var(--review)" }}>
                Two reads disagree — confirm against the document.
              </p>
              <div className="mt-1 flex flex-col gap-0.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-ink-3">Model</span>
                  <span className="figure text-ink">{disagreement.modelDisplay}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-ink-3">Second read</span>
                  <span className="figure text-ink">{disagreement.ocrText}</span>
                </div>
              </div>
              <div className="mt-1.5 flex gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    r.commitEdit(field.path, field.kind, disagreement.ocrText);
                  }}
                  className="rounded-control px-2 py-0.5 text-[11px] font-medium text-white"
                  style={{ background: "var(--review)" }}
                >
                  Use second read
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    r.toggleConfirm(field.path);
                  }}
                  className="rounded-control border border-line px-2 py-0.5 text-[11px] text-ink-2 hover:bg-surface"
                >
                  Keep model
                </button>
              </div>
            </div>
          )}

          {/* source-link fallback when there is no bbox to highlight */}
          {isSelected && !fieldObj?.source?.bbox && fieldObj?.source?.snippet && (
            <p className="mt-1 text-xs text-ink-3">
              Source: “{fieldObj.source.snippet}”
            </p>
          )}
        </div>

        <ConfirmButton
          confirmed={isConfirmed}
          onClick={(e) => {
            e.stopPropagation();
            r.toggleConfirm(field.path);
          }}
        />
      </div>
    </div>
  );
}

function EditInput({
  field,
  initial,
  mono,
}: {
  field: FieldDef;
  initial: string;
  mono: boolean;
}) {
  const r = useReview();
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // Stop the panel's keyboard loop from also acting on these keys.
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      r.commitEdit(field.path, field.kind, e.currentTarget.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      r.cancelEdit();
    }
  }

  return (
    <input
      ref={ref}
      defaultValue={initial}
      onKeyDown={onKeyDown}
      onBlur={(e) => r.commitEdit(field.path, field.kind, e.currentTarget.value)}
      onClick={(e) => e.stopPropagation()}
      className={`mt-0.5 w-full rounded-control border border-line bg-surface px-2 py-1 text-[15px] text-ink focus-visible:border-accent ${
        mono ? "figure" : ""
      }`}
    />
  );
}

function ConfirmButton({
  confirmed,
  onClick,
}: {
  confirmed: boolean;
  onClick: (e: ReactMouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={confirmed}
      title={confirmed ? "Confirmed — click to undo" : "Confirm (mark verified)"}
      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors"
      style={
        confirmed
          ? { background: "var(--verified)", borderColor: "var(--verified)", color: "#fff" }
          : { borderColor: "var(--line)", color: "var(--ink-3)" }
      }
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m5 12 5 5L20 7" />
      </svg>
    </button>
  );
}

function messageColor(severity: "error" | "warning" | "info", confirmed: boolean): string {
  if (confirmed) return "var(--ink-3)";
  if (severity === "error") return "var(--error)";
  if (severity === "warning") return "var(--review)";
  return "var(--ink-3)"; // info — muted, not alarming
}
