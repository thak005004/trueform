"use client";

import { useMemo } from "react";
import { usePacket, type PacketDocument } from "@/state/document-context";
import {
  reconcilePacket,
  yearOverYear,
  type CrossDocIssue,
  type YearOverYear,
} from "@/review/reconcile";
import {
  docCurrentW2,
  docSummary,
  reconcileInputs,
  type DocSummary,
} from "@/review/packet-helpers";

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function Dashboard() {
  const { documents, openDocument, retryExtraction } = usePacket();
  // Reconcile from CORRECTED data (draft ?? extraction.w2) — edits update this live.
  const recon = useMemo(() => reconcilePacket(reconcileInputs(documents)), [documents]);
  const yoy = useMemo(() => yearOverYear(reconcileInputs(documents)), [documents]);
  const single = documents.length <= 1;

  return (
    <div className="h-full overflow-auto bg-paper">
      <div className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6 sm:px-6">
        <header className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-ink">Client packet</h2>
          <span className="text-sm text-ink-2">
            {documents.length} W-2{documents.length === 1 ? "" : "s"}
          </span>
        </header>

        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-3">
          <Stat label="Documents" value={String(recon.aggregates.documentCount)} />
          <Stat label="Total Box 1 wages" value={usd(recon.aggregates.totalBox1Wages)} mono />
          <Stat label="Total Box 2 withholding" value={usd(recon.aggregates.totalBox2Withholding)} mono />
        </div>

        {/* Cross-doc reconciliation only matters for multi-doc packets. */}
        {!single && (
          <Reconciliation issues={recon.crossDocIssues} documents={documents} onJump={openDocument} />
        )}

        {yoy.length > 0 && <YearOverYearPanel entries={yoy} onJump={openDocument} />}

        <DocumentList documents={documents} onOpen={openDocument} onRetry={retryExtraction} />
      </div>
    </div>
  );
}

function Stat({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-surface px-4 py-3">
      <div className="text-[11px] text-ink-3">{label}</div>
      <div className={`text-lg text-ink ${mono ? "figure" : ""}`}>{value}</div>
    </div>
  );
}

function Reconciliation({
  issues,
  documents,
  onJump,
}: {
  issues: CrossDocIssue[];
  documents: PacketDocument[];
  onJump: (id: string) => void;
}) {
  const nameFor = (id: string) => {
    const d = documents.find((x) => x.id === id);
    return docCurrentW2(d!)?.employee.name.value || d?.fileName || id;
  };

  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface">
      <header className="border-b border-line px-4 py-2.5 text-xs font-medium text-ink-3">
        Cross-document reconciliation
      </header>
      <div className="p-3">
        {issues.length === 0 ? (
          <div className="flex items-center gap-2 px-1 py-1.5 text-sm" style={{ color: "var(--verified)" }}>
            <CheckIcon />
            All documents reconcile — consistent identity, no cross-form conflicts.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {issues.map((iss, i) => {
              const color = iss.severity === "error" ? "var(--error)" : "var(--review)";
              const bg = iss.severity === "error" ? "var(--error-bg)" : "var(--review-bg)";
              return (
                <li key={i} className="rounded-md px-3 py-2" style={{ background: bg }}>
                  <div className="flex items-start gap-2">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                    <div className="min-w-0">
                      <p className="text-sm" style={{ color }}>
                        {iss.message}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {iss.docIds.map((id) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => onJump(id)}
                            className="rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] text-ink-2 hover:border-ink-3"
                          >
                            {nameFor(id)} →
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function YearOverYearPanel({
  entries,
  onJump,
}: {
  entries: YearOverYear[];
  onJump: (id: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface">
      <header className="border-b border-line px-4 py-2.5 text-xs font-medium text-ink-3">
        Year over year
      </header>
      <div className="flex flex-col divide-y divide-line">
        {entries.map((e, i) => (
          <div key={i} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-ink">
                {e.employeeName ?? "—"}{" "}
                <span className="figure text-xs text-ink-3">· SSN ••••{e.ssnLast4}</span>
              </span>
              <span className="figure text-xs text-ink-2">
                {e.prior.year} → {e.current.year}
              </span>
            </div>

            <div className="mt-1 text-xs text-ink-2">
              Box 1 wages:{" "}
              <span className="figure text-ink">
                {usd(e.prior.box1)} → {usd(e.current.box1)}
              </span>
              {e.wageDeltaPct != null && (
                <span
                  className="figure ml-1.5"
                  style={{ color: Math.abs(e.wageDeltaPct) >= 30 ? "var(--review)" : "var(--ink-3)" }}
                >
                  ({e.wageDeltaPct > 0 ? "+" : ""}
                  {e.wageDeltaPct}%)
                </span>
              )}
            </div>

            {e.notes.map((n, k) => (
              <p
                key={k}
                className="mt-1 text-[13px] leading-snug"
                style={{ color: n.severity === "warning" ? "var(--review)" : "var(--ink-2)" }}
              >
                {n.message}
              </p>
            ))}

            <div className="mt-1.5 flex gap-1.5">
              <button
                type="button"
                onClick={() => onJump(e.current.docId)}
                className="rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] text-ink-2 hover:border-ink-3"
              >
                {e.current.year} →
              </button>
              <button
                type="button"
                onClick={() => onJump(e.prior.docId)}
                className="rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] text-ink-2 hover:border-ink-3"
              >
                {e.prior.year} →
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function DocumentList({
  documents,
  onOpen,
  onRetry,
}: {
  documents: PacketDocument[];
  onOpen: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface">
      <header className="border-b border-line px-4 py-2.5 text-xs font-medium text-ink-3">Documents</header>
      <ul className="divide-y divide-line">
        {documents.map((doc) => (
          <DocumentRow key={doc.id} doc={doc} onOpen={onOpen} onRetry={onRetry} />
        ))}
      </ul>
    </section>
  );
}

function DocumentRow({
  doc,
  onOpen,
  onRetry,
}: {
  doc: PacketDocument;
  onOpen: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  const sum = docSummary(doc);

  // Still working: a calm skeleton row, not a frozen blank.
  if (sum.kind === "extracting" || sum.kind === "pending") {
    return (
      <li className="flex items-center gap-3 px-4 py-3">
        <Spinner />
        <div className="min-w-0 flex-1">
          <span className="figure truncate text-[11px] text-ink-3">{doc.fileName}</span>
          <div className="mt-1.5 h-3 w-40 max-w-full animate-pulse rounded bg-line" />
        </div>
        <span className="figure shrink-0 text-[11px] text-ink-3">extracting…</span>
      </li>
    );
  }

  // Failed: a clear, recoverable error with Retry — the rest of the list is fine.
  if (sum.kind === "failed") {
    return (
      <li className="flex items-center gap-3 px-4 py-3">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--error)" }} />
        <div className="min-w-0 flex-1">
          <span className="figure truncate text-[11px] text-ink-3">{doc.fileName}</span>
          <p className="mt-0.5 text-xs" style={{ color: "var(--error)" }}>
            {doc.extractError ?? "Extraction failed."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onRetry(doc.id)}
          className="shrink-0 rounded-control border border-line px-2.5 py-1 text-xs text-ink-2 hover:bg-paper"
        >
          Retry
        </button>
      </li>
    );
  }

  // Done: open into the single-form review.
  const w2 = docCurrentW2(doc);
  const box1 = w2?.box1_wages.value;
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(doc.id)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-paper"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-sm font-medium text-ink">
              {w2?.employee.name.value ?? "—"}
            </span>
            <span className="figure truncate text-[11px] text-ink-3">{doc.fileName}</span>
          </div>
          <div className="truncate text-xs text-ink-2">
            {w2?.employer.name.value ?? "Employer —"} · {w2?.taxYear.value ?? "—"}
          </div>
        </div>
        <div className="figure hidden shrink-0 text-sm text-ink sm:block">
          {box1 != null ? usd(box1) : "—"}
        </div>
        <StatusBadge sum={sum} />
        <span aria-hidden className="text-ink-3">→</span>
      </button>
    </li>
  );
}

function StatusBadge({ sum }: { sum: DocSummary }) {
  if (sum.kind !== "done") return null;
  if (sum.ready) return <Badge text="ready" color="var(--verified)" bg="var(--verified-bg)" check />;

  const parts: string[] = [];
  if (sum.errors) parts.push(`${sum.errors} error${sum.errors === 1 ? "" : "s"}`);
  if (sum.reviews) parts.push(`${sum.reviews} review`);
  return (
    <Badge
      text={parts.join(" · ")}
      color={sum.errors ? "var(--error)" : "var(--review)"}
      bg={sum.errors ? "var(--error-bg)" : "var(--review-bg)"}
    />
  );
}

export function Spinner() {
  return (
    <svg className="h-4 w-4 shrink-0 animate-spin text-ink-3" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function Badge({
  text,
  color,
  bg,
  check = false,
  pulse = false,
}: {
  text: string;
  color: string;
  bg: string;
  check?: boolean;
  pulse?: boolean;
}) {
  return (
    <span
      className={`figure inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${pulse ? "animate-pulse" : ""}`}
      style={{ color, background: bg }}
    >
      {check && <CheckIcon />}
      {text}
    </span>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}
