"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { W2 } from "@/lib/w2-schema";
import type { ValidationResult } from "@/lib/validation";
import {
  usePacket,
  type AuditEntry,
  type PacketDocument,
} from "@/state/document-context";
import type { RenderedPage } from "@/render/renderDocument";
import {
  auditValue,
  formatValue,
  getByPath,
  parseInput,
  type FieldKind,
} from "@/review/fields";
import {
  runCrossRead,
  valuePresent,
  type CrossReadResult,
  type FieldDisagreement,
} from "@/review/cross-read";

export type { AuditEntry };

/** Status a field row paints with: validation-derived, or human-verified. */
export type FieldStatus = "error" | "review" | "verified" | "neutral";

interface ReviewContextValue {
  w2: W2;
  validation: ValidationResult;
  confirmed: Set<string>;
  audit: AuditEntry[];
  selected: string | null;
  editing: string | null;

  select: (path: string | null) => void;
  focusPath: (path: string) => void;
  startEdit: (path: string) => void;
  cancelEdit: () => void;
  commitEdit: (path: string, kind: FieldKind, rawInput: string) => void;
  toggleConfirm: (path: string) => void;

  effectiveStatus: (path: string) => FieldStatus;
  isEdited: (path: string) => boolean;
  originalText: (path: string, kind: FieldKind) => string;
  registerRow: (path: string, el: HTMLElement | null) => void;

  /** Second-read (Tesseract) status + the ACTIVE disagreement for a field, if any. */
  crossReadStatus: "running" | "done";
  disagreementFor: (path: string) => FieldDisagreement | null;
  /** True when the second read positively confirmed this (still-unedited) field. */
  crossReadConfirmed: (path: string) => boolean;
}

const ReviewContext = createContext<ReviewContextValue | null>(null);

/**
 * Holds the live review state for ONE document (the active packet document).
 * Initializes from that document's stored draft/validation/edits and syncs
 * changes back to the packet, so each document keeps its own corrections.
 * Mounted with a key of `${doc.id}-${doc.extractionVersion}` so re-extracting
 * or switching documents starts fresh.
 */
export function ReviewProvider({
  doc,
  pages,
  children,
}: {
  doc: PacketDocument;
  pages: RenderedPage[];
  children: ReactNode;
}) {
  const { updateReview } = usePacket();

  // Initialize from the document's persisted review state.
  const [w2, setW2] = useState<W2>(() => structuredClone(doc.draft ?? doc.extraction!.w2));
  const [validation, setValidation] = useState<ValidationResult>(doc.validation!);
  const [confirmed, setConfirmed] = useState<Set<string>>(() => new Set(doc.confirmed));
  const [audit, setAudit] = useState<AuditEntry[]>(doc.audit);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const [crossRead, setCrossRead] = useState<CrossReadResult | null>(null);
  const [crossReadStatus, setCrossReadStatus] = useState<"running" | "done">("running");

  const rowRefs = useRef<Map<string, HTMLElement>>(new Map());
  // Immutable baseline the "edited" marker compares against.
  const originalRef = useRef<W2>(doc.original ?? structuredClone(doc.extraction!.w2));
  const docId = doc.id;

  // Independent second read (Tesseract) over the original extraction, once per open.
  // Status starts at "running" (initial state); these async setStates land when the
  // OCR pass resolves, guarded so a fast doc-switch can't set state after unmount.
  useEffect(() => {
    let cancelled = false;
    runCrossRead(pages, originalRef.current)
      .then((res) => {
        if (cancelled) return;
        setCrossRead(res);
        setCrossReadStatus("done");
      })
      .catch(() => {
        if (!cancelled) setCrossReadStatus("done");
      });
    return () => {
      cancelled = true;
    };
  }, [pages]);

  // Persist review state back to the packet document as it changes (so reconcile
  // and a later doc-switch see the corrected values). Depends on docId, not the
  // whole doc object, to avoid a write→re-render loop.
  useEffect(() => {
    updateReview(docId, { draft: w2, validation, confirmed: [...confirmed], audit });
  }, [w2, validation, confirmed, audit, docId, updateReview]);

  const registerRow = useCallback((path: string, el: HTMLElement | null) => {
    if (el) rowRefs.current.set(path, el);
    else rowRefs.current.delete(path);
  }, []);

  const focusPath = useCallback((path: string) => {
    rowRefs.current.get(path)?.focus();
  }, []);

  const isEdited = useCallback(
    (path: string) => getByPath(w2, path)?.value !== getByPath(originalRef.current, path)?.value,
    [w2],
  );
  const originalText = useCallback(
    (path: string, kind: FieldKind) => formatValue(getByPath(originalRef.current, path), kind),
    [],
  );

  const select = useCallback((path: string | null) => setSelected(path), []);
  const startEdit = useCallback((path: string) => {
    setSelected(path);
    setEditing(path);
  }, []);
  const cancelEdit = useCallback(() => setEditing(null), []);

  // Re-run the lib's validateW2 via the server on the edited W-2 — never in the client.
  const revalidate = useCallback(async (nextW2: W2) => {
    try {
      const res = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ w2: nextW2 }),
      });
      if (res.ok) setValidation((await res.json()) as ValidationResult);
    } catch {
      // Keep prior validation on a transient failure rather than blanking flags.
    }
  }, []);

  const commitEdit = useCallback(
    (path: string, kind: FieldKind, rawInput: string) => {
      setEditing(null);
      const field = getByPath(w2, path);
      const parsed = parseInput(rawInput, kind);
      if (parsed.value === field.value) return; // no-op edit

      const oldDisplay = auditValue(field, kind);
      const next = structuredClone(w2);
      const nf = getByPath(next, path);
      nf.value = parsed.value;
      nf.raw = parsed.raw;
      nf.present = parsed.present;
      setW2(next);

      // Editing invalidates a prior confirmation — the value changed.
      setConfirmed((prev) => {
        if (!prev.has(path)) return prev;
        const s = new Set(prev);
        s.delete(path);
        return s;
      });
      setAudit((prev) => [
        ...prev,
        { field: path, action: "edit", oldValue: oldDisplay, newValue: auditValue(nf, kind), at: Date.now() },
      ]);
      void revalidate(next);
    },
    [w2, revalidate],
  );

  const toggleConfirm = useCallback((path: string) => {
    setConfirmed((prev) => {
      const s = new Set(prev);
      if (s.has(path)) s.delete(path);
      else s.add(path);
      return s;
    });
    setAudit((prev) =>
      prev.length && prev[prev.length - 1]?.field === path && prev[prev.length - 1]?.action === "confirmed"
        ? prev
        : [...prev, { field: path, action: "confirmed", at: Date.now() }],
    );
  }, []);

  // An ACTIVE "couldn't confirm" = the second read didn't contain the CURRENT value
  // and the field isn't confirmed. Editing to a value the region OCR contains (or
  // confirming the field) resolves it.
  const disagreementFor = useCallback(
    (path: string): FieldDisagreement | null => {
      const d = crossRead?.disagreements[path];
      if (!d || confirmed.has(path)) return null;
      const current = getByPath(w2, path)?.value;
      return valuePresent(d.kind, current, d.ocrText) ? null : d;
    },
    [crossRead, confirmed, w2],
  );

  const crossReadConfirmed = useCallback(
    (path: string) => (crossRead?.confirmed.includes(path) ?? false) && !isEdited(path),
    [crossRead, isEdited],
  );

  const effectiveStatus = useCallback(
    (path: string): FieldStatus => {
      if (confirmed.has(path)) return "verified";
      const status = validation.byField[path]?.status;
      if (status === "error") return "error";
      if (status === "review") return "review";
      if (disagreementFor(path)) return "review";
      return "neutral";
    },
    [confirmed, validation, disagreementFor],
  );

  return (
    <ReviewContext.Provider
      value={{
        w2,
        validation,
        confirmed,
        audit,
        selected,
        editing,
        select,
        focusPath,
        startEdit,
        cancelEdit,
        commitEdit,
        toggleConfirm,
        effectiveStatus,
        isEdited,
        originalText,
        registerRow,
        crossReadStatus,
        disagreementFor,
        crossReadConfirmed,
      }}
    >
      {children}
    </ReviewContext.Provider>
  );
}

export function useReview(): ReviewContextValue {
  const ctx = useContext(ReviewContext);
  if (!ctx) throw new Error("useReview must be used within a ReviewProvider");
  return ctx;
}
