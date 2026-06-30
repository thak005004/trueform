"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { W2 } from "@/lib/w2-schema";
import type { ValidationResult } from "@/lib/validation";
import type { ExtractResult } from "@/state/document-context";
import {
  auditValue,
  formatValue,
  getByPath,
  parseInput,
  type FieldKind,
} from "@/review/fields";

/** Status a field row paints with: validation-derived, or human-verified. */
export type FieldStatus = "error" | "review" | "verified" | "neutral";

export interface AuditEntry {
  field: string;
  action: "edit" | "confirmed";
  oldValue?: string;
  newValue?: string;
  at: number;
}

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
  /** True when the current value differs from what was originally extracted. */
  isEdited: (path: string) => boolean;
  /** Formatted ORIGINAL value, for the "was …" marker. */
  originalText: (path: string, kind: FieldKind) => string;
  registerRow: (path: string, el: HTMLElement | null) => void;
}

const ReviewContext = createContext<ReviewContextValue | null>(null);

export function ReviewProvider({
  result,
  children,
}: {
  result: ExtractResult;
  children: ReactNode;
}) {
  // Working copy of the W-2 the user edits; starts as a clone of the extraction.
  const [w2, setW2] = useState<W2>(() => structuredClone(result.extraction.w2));
  const [validation, setValidation] = useState<ValidationResult>(result.validation);
  const [confirmed, setConfirmed] = useState<Set<string>>(() => new Set());
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const rowRefs = useRef<Map<string, HTMLElement>>(new Map());
  // Immutable snapshot of the extracted W-2 — the baseline an "edited" marker
  // compares against. Reverting a value back to this clears the marker.
  const originalRef = useRef<W2>(structuredClone(result.extraction.w2));

  const isEdited = useCallback(
    (path: string) => getByPath(w2, path)?.value !== getByPath(originalRef.current, path)?.value,
    [w2],
  );
  const originalText = useCallback(
    (path: string, kind: FieldKind) => formatValue(getByPath(originalRef.current, path), kind),
    [],
  );

  const registerRow = useCallback((path: string, el: HTMLElement | null) => {
    if (el) rowRefs.current.set(path, el);
    else rowRefs.current.delete(path);
  }, []);

  const focusPath = useCallback((path: string) => {
    rowRefs.current.get(path)?.focus();
  }, []);

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
      if (s.has(path)) {
        s.delete(path);
        return s;
      }
      s.add(path);
      return s;
    });
    setAudit((prev) =>
      // Log only the act of confirming (not un-confirming).
      prev.length && prev[prev.length - 1]?.field === path && prev[prev.length - 1]?.action === "confirmed"
        ? prev
        : [...prev, { field: path, action: "confirmed", at: Date.now() }],
    );
  }, []);

  const effectiveStatus = useCallback(
    (path: string): FieldStatus => {
      if (confirmed.has(path)) return "verified";
      const status = validation.byField[path]?.status;
      if (status === "error") return "error";
      if (status === "review") return "review";
      return "neutral";
    },
    [confirmed, validation],
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
