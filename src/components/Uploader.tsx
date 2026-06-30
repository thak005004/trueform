"use client";

import { useRef, type ChangeEvent } from "react";
import { useDocument, usePacket } from "@/state/document-context";

// Single file per pick; HEIC and handwriting are out of scope (writeup assumption).
const ACCEPT = "application/pdf,image/png,image/jpeg";

/**
 * Header upload control. Uploads APPEND to the packet (and auto-extract), so the
 * label is "Add W-2" once a packet exists, "Upload W-2" when it's empty.
 */
export function Uploader() {
  const { loadFile } = useDocument();
  const { documents } = usePacket();
  const inputRef = useRef<HTMLInputElement>(null);

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
    e.target.value = ""; // allow re-selecting the same file
  }

  return (
    <>
      <input ref={inputRef} type="file" accept={ACCEPT} onChange={onChange} className="hidden" />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="rounded-control bg-ink px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent"
      >
        {documents.length ? "Add W-2" : "Upload W-2"}
      </button>
    </>
  );
}
