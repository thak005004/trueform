"use client";

/**
 * Shared "rendered document" + extraction state.
 *
 * Kept deliberately tiny: React context + useState, no database, no persistence
 * (a refresh clears it — fine for this tool). Later steps (the fields pane,
 * source-link highlighting) will read `pages` and `result` from here.
 *
 * NOTE: the type-only imports below pull from lib modules that depend on zod
 * only — never the Anthropic SDK — and are erased at build, so no server code
 * leaks into the client bundle.
 */

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { renderDocument, type RenderedPage } from "@/render/renderDocument";
import type { W2Extraction } from "@/lib/w2-schema";
import type { ValidationResult } from "@/lib/validation";

type Status = "idle" | "rendering" | "ready" | "error";
type ExtractStatus = "idle" | "extracting" | "done" | "error";

/** The /api/extract success payload. */
export interface ExtractResult {
  extraction: W2Extraction;
  validation: ValidationResult;
}

interface DocumentState {
  // Rendered document
  fileName: string | null;
  pages: RenderedPage[];
  status: Status;
  error: string | null;
  loadFile: (file: File) => Promise<void>;
  reset: () => void;

  // Extraction
  extractStatus: ExtractStatus;
  extractError: string | null;
  result: ExtractResult | null;
  /** Bumps on each successful extraction — used to remount review state. */
  resultVersion: number;
  extract: () => Promise<void>;
}

const DocumentContext = createContext<DocumentState | null>(null);

export function DocumentProvider({ children }: { children: ReactNode }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const [extractStatus, setExtractStatus] = useState<ExtractStatus>("idle");
  const [extractError, setExtractError] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [resultVersion, setResultVersion] = useState(0);

  const clearExtraction = useCallback(() => {
    setExtractStatus("idle");
    setExtractError(null);
    setResult(null);
  }, []);

  const loadFile = useCallback(
    async (file: File) => {
      setStatus("rendering");
      setError(null);
      setFileName(file.name);
      setPages([]);
      clearExtraction(); // a new document invalidates any prior extraction
      try {
        const rendered = await renderDocument(file);
        setPages(rendered);
        setStatus("ready");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to render the document.");
        setStatus("error");
      }
    },
    [clearExtraction],
  );

  const reset = useCallback(() => {
    setFileName(null);
    setPages([]);
    setStatus("idle");
    setError(null);
    clearExtraction();
  }, [clearExtraction]);

  const extract = useCallback(async () => {
    if (pages.length === 0) return;
    setExtractStatus("extracting");
    setExtractError(null);
    setResult(null);
    try {
      // Send only the dataUrls; the server derives base64 + mediaType from them.
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pages: pages.map((p) => ({ dataUrl: p.dataUrl })) }),
      });
      const json = await res.json();
      if (!res.ok) {
        // Log full server detail (zod issues / raw tool input) for debugging.
        if (json?.zodIssues || json?.rawToolInput) {
          console.error("Extraction error detail:", json);
        }
        const extra = json?.zodIssues
          ? ` (${json.zodIssues.length} schema issue(s) — see console)`
          : "";
        throw new Error((json?.error ?? `Request failed (${res.status})`) + extra);
      }
      setResult(json as ExtractResult);
      setResultVersion((v) => v + 1);
      setExtractStatus("done");
    } catch (e) {
      setExtractError(e instanceof Error ? e.message : "Extraction failed.");
      setExtractStatus("error");
    }
  }, [pages]);

  return (
    <DocumentContext.Provider
      value={{
        fileName,
        pages,
        status,
        error,
        loadFile,
        reset,
        extractStatus,
        extractError,
        result,
        resultVersion,
        extract,
      }}
    >
      {children}
    </DocumentContext.Provider>
  );
}

export function useDocument(): DocumentState {
  const ctx = useContext(DocumentContext);
  if (!ctx) throw new Error("useDocument must be used within a DocumentProvider");
  return ctx;
}
