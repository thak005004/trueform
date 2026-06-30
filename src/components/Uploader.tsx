"use client";

import { useRef, type ChangeEvent } from "react";
import { useDocument } from "@/state/document-context";

// Single file for now. HEIC and handwriting are explicitly out of scope
// (stated as an assumption in the writeup).
const ACCEPT = "application/pdf,image/png,image/jpeg";

/**
 * The quiet header upload control: primary action when empty, a "Replace"
 * affordance (plus filename + clear) once a document is loaded. Same render
 * pipeline as the empty-state DropZone.
 */
export function Uploader() {
  const { loadFile, status, fileName, reset } = useDocument();
  const inputRef = useRef<HTMLInputElement>(null);

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
    e.target.value = ""; // allow re-selecting the same file
  }

  const busy = status === "rendering";

  return (
    <div className="flex items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        onChange={onChange}
        className="hidden"
      />

      {fileName && (
        <span
          className="hidden max-w-[14rem] truncate text-sm text-ink-2 sm:inline"
          title={fileName}
        >
          {fileName}
        </span>
      )}
      {fileName && !busy && (
        <button
          type="button"
          onClick={reset}
          className="text-sm text-ink-3 underline-offset-2 hover:text-ink-2 hover:underline"
        >
          Clear
        </button>
      )}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="rounded-control bg-ink px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent disabled:opacity-50"
      >
        {busy ? "Rendering…" : fileName ? "Replace" : "Upload W-2"}
      </button>
    </div>
  );
}
