"use client";

/**
 * CLIENT PACKET state — a collection of W-2s reviewed together.
 *
 * A packet is an ordered list of documents. Uploading APPENDS a document and
 * auto-extracts it. The existing single-form review is the "drill-in" view for
 * the active document; the dashboard is the packet-level view. `useDocument()`
 * (the active-document facade) preserves the old single-form API.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { encodeForApi, renderDocument, type RenderedPage } from "@/render/renderDocument";
import type { W2, W2Extraction } from "@/lib/w2-schema";
import type { ValidationResult } from "@/lib/validation";

export interface AuditEntry {
  field: string;
  action: "edit" | "confirmed";
  oldValue?: string;
  newValue?: string;
  at: number;
}

export type DocStatus = "rendering" | "ready" | "error";
export type ExtractStatus = "idle" | "extracting" | "done" | "error";
export type PacketView = "dashboard" | "document";

/** One W-2 in a packet: its file, rendered pages, extraction, and live edit state. */
export interface PacketDocument {
  id: string;
  fileName: string;
  pages: RenderedPage[];
  status: DocStatus;
  error: string | null;
  extractStatus: ExtractStatus;
  extractError: string | null;
  extractionVersion: number;
  extraction: W2Extraction | null; // original extraction, immutable
  validation: ValidationResult | null; // current (updates as the draft is edited)
  draft: W2 | null; // editable working copy; starts as a clone of extraction.w2
  original: W2 | null; // immutable baseline for the "edited" markers
  confirmed: string[]; // human-verified field paths
  audit: AuditEntry[];
}

export interface ExtractResult {
  extraction: W2Extraction;
  validation: ValidationResult;
}

export type ReviewPatch = Partial<
  Pick<PacketDocument, "validation" | "draft" | "confirmed" | "audit">
>;

interface PacketContextValue {
  documents: PacketDocument[];
  activeId: string | null;
  active: PacketDocument | null;
  view: PacketView;
  loadFile: (file: File) => Promise<void>;
  loadFiles: (files: File[]) => Promise<void>;
  reset: () => void;
  extract: () => Promise<void>;
  retryExtraction: (id: string) => Promise<void>;
  setActive: (id: string) => void;
  openDocument: (id: string) => void;
  openDashboard: () => void;
  updateReview: (docId: string, patch: ReviewPatch) => void;
  /** Replace the whole session (used by "open a saved review"). */
  restore: (documents: PacketDocument[], activeId: string | null, view: PacketView) => void;
}

const PacketContext = createContext<PacketContextValue | null>(null);

function newId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `doc_${Math.floor(Math.random() * 1e9)}`;
}

/** Calm, recoverable message shown on a failed document row. status=null → network/timeout. */
function friendlyError(status: number | null): string {
  if (status === 422) return "Couldn't read this as a W-2 — check the file, or try re-extracting.";
  if (status === null) return "Couldn't reach the extraction service — check your connection and re-extract.";
  return "Extraction failed (server error) — try re-extracting.";
}

function blankDocument(file: File): PacketDocument {
  return {
    id: newId(),
    fileName: file.name,
    pages: [],
    status: "rendering",
    error: null,
    extractStatus: "idle",
    extractError: null,
    extractionVersion: 0,
    extraction: null,
    validation: null,
    draft: null,
    original: null,
    confirmed: [],
    audit: [],
  };
}

export function PacketProvider({ children }: { children: ReactNode }) {
  const [documents, setDocuments] = useState<PacketDocument[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<PacketView>("document");

  const patchDoc = useCallback((id: string, patch: Partial<PacketDocument>) => {
    setDocuments((docs) => docs.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }, []);

  // Run extraction for a specific document (reused for first upload and re-extract).
  // One document failing never throws past here — the rest of the packet keeps working.
  const runExtraction = useCallback(
    async (docId: string, pages: RenderedPage[]) => {
      if (pages.length === 0) return;
      patchDoc(docId, { extractStatus: "extracting", extractError: null });
      try {
        // Send a size-bounded JPEG copy (the crisp PNG raster stays for the viewer).
        const apiPages = await Promise.all(pages.map((p) => encodeForApi(p)));
        const res = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pages: apiPages.map((dataUrl) => ({ dataUrl })) }),
        });

        let json: Record<string, unknown> = {};
        try {
          json = await res.json();
        } catch {
          /* non-JSON body (e.g. a gateway error) — fall through to status handling */
        }

        if (!res.ok) {
          // Log the technical detail; show the user a calm, recoverable message.
          console.error(`Extraction failed (HTTP ${res.status}):`, json);
          patchDoc(docId, { extractStatus: "error", extractError: friendlyError(res.status) });
          return;
        }

        const { extraction, validation } = json as unknown as ExtractResult;

        // A non-W-2 (bank statement, random PDF) typically comes back schema-valid
        // but EMPTY — the model correctly refuses to fabricate. Treat "no identity
        // and no wages at all" as unreadable so the user gets a clear message and a
        // Retry instead of a misleading blank review.
        const w2 = extraction.w2;
        const looksEmpty =
          !w2.box1_wages.present &&
          !w2.employee.name.present &&
          !w2.employer.name.present &&
          !w2.employee.ssn.present;
        if (looksEmpty) {
          patchDoc(docId, { extractStatus: "error", extractError: friendlyError(422) });
          return;
        }

        setDocuments((docs) =>
          docs.map((d) =>
            d.id === docId
              ? {
                  ...d,
                  extraction,
                  validation,
                  draft: structuredClone(extraction.w2),
                  original: structuredClone(extraction.w2),
                  confirmed: [],
                  audit: [],
                  extractStatus: "done",
                  extractionVersion: d.extractionVersion + 1,
                }
              : d,
          ),
        );
      } catch (e) {
        // Network failure, timeout, or canvas/encoding error — recoverable via Retry.
        console.error("Extraction request error:", e);
        patchDoc(docId, { extractStatus: "error", extractError: friendlyError(null) });
      }
    },
    [patchDoc],
  );

  // Upload APPENDS a document, renders it, and auto-extracts.
  const loadFile = useCallback(
    async (file: File) => {
      const isFirst = documents.length === 0;
      const doc = blankDocument(file);
      setDocuments((docs) => [...docs, doc]);
      setActiveId(doc.id);
      // First doc → drill straight into its review; additional docs → show the packet.
      setView(isFirst ? "document" : "dashboard");
      try {
        const pages = await renderDocument(file);
        patchDoc(doc.id, { pages, status: "ready" });
        await runExtraction(doc.id, pages);
      } catch (e) {
        patchDoc(doc.id, {
          status: "error",
          error: e instanceof Error ? e.message : "Failed to render the document.",
        });
      }
    },
    [documents.length, patchDoc, runExtraction],
  );

  // Load several files at once (e.g. a prior-year + current-year sample packet).
  const loadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const entries = files.map((file) => ({ file, doc: blankDocument(file) }));
      setDocuments((docs) => [...docs, ...entries.map((e) => e.doc)]);
      setActiveId(entries[entries.length - 1].doc.id);
      setView(files.length > 1 ? "dashboard" : "document");
      await Promise.all(
        entries.map(async ({ file, doc }) => {
          try {
            const pages = await renderDocument(file);
            patchDoc(doc.id, { pages, status: "ready" });
            await runExtraction(doc.id, pages);
          } catch (e) {
            patchDoc(doc.id, {
              status: "error",
              error: e instanceof Error ? e.message : "Failed to render the document.",
            });
          }
        }),
      );
    },
    [patchDoc, runExtraction],
  );

  const reset = useCallback(() => {
    setDocuments([]);
    setActiveId(null);
    setView("document");
  }, []);

  // Manual re-extract of the active document.
  const extract = useCallback(async () => {
    const doc = documents.find((d) => d.id === activeId);
    if (doc) await runExtraction(doc.id, doc.pages);
  }, [documents, activeId, runExtraction]);

  // Retry extraction for any document by id (used by failed dashboard rows).
  const retryExtraction = useCallback(
    async (id: string) => {
      const doc = documents.find((d) => d.id === id);
      if (doc) await runExtraction(doc.id, doc.pages);
    },
    [documents, runExtraction],
  );

  const restore = useCallback(
    (docs: PacketDocument[], id: string | null, v: PacketView) => {
      setDocuments(docs);
      setActiveId(id);
      setView(v);
    },
    [],
  );

  const setActive = useCallback((id: string) => setActiveId(id), []);
  const openDocument = useCallback((id: string) => {
    setActiveId(id);
    setView("document");
  }, []);
  const openDashboard = useCallback(() => setView("dashboard"), []);
  const updateReview = useCallback(
    (docId: string, patch: ReviewPatch) => patchDoc(docId, patch),
    [patchDoc],
  );

  const active = useMemo(
    () => documents.find((d) => d.id === activeId) ?? null,
    [documents, activeId],
  );

  return (
    <PacketContext.Provider
      value={{
        documents,
        activeId,
        active,
        view,
        loadFile,
        loadFiles,
        reset,
        extract,
        retryExtraction,
        setActive,
        openDocument,
        openDashboard,
        updateReview,
        restore,
      }}
    >
      {children}
    </PacketContext.Provider>
  );
}

export function usePacket(): PacketContextValue {
  const ctx = useContext(PacketContext);
  if (!ctx) throw new Error("usePacket must be used within a PacketProvider");
  return ctx;
}

// --- Backward-compatible "active document" facade -------------------------
export interface ActiveDocumentView {
  fileName: string | null;
  pages: RenderedPage[];
  status: "idle" | DocStatus;
  error: string | null;
  extractStatus: ExtractStatus;
  extractError: string | null;
  result: ExtractResult | null;
  resultVersion: number;
  loadFile: (file: File) => Promise<void>;
  reset: () => void;
  extract: () => Promise<void>;
}

export function useActiveDocument(): ActiveDocumentView {
  const { active, loadFile, reset, extract } = usePacket();
  return {
    fileName: active?.fileName ?? null,
    pages: active?.pages ?? [],
    status: active ? active.status : "idle",
    error: active?.error ?? null,
    extractStatus: active?.extractStatus ?? "idle",
    extractError: active?.extractError ?? null,
    result:
      active?.extraction && active?.validation
        ? { extraction: active.extraction, validation: active.validation }
        : null,
    resultVersion: active?.extractionVersion ?? 0,
    loadFile,
    reset,
    extract,
  };
}
