"use client";

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useDocument, usePacket } from "@/state/document-context";

const ACCEPT = "application/pdf,image/png,image/jpeg";

/**
 * The upload target card: BOTH click-to-upload and drag-and-drop, funnelling into
 * the same render pipeline as the header button. Accepts ONE or MANY files — a
 * multi-file drop fans out through the bounded-concurrency queue.
 */
export function DropZone() {
  const { loadFile } = useDocument();
  const { loadFiles } = usePacket();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function pick(files: File[]) {
    if (files.length === 1) loadFile(files[0]);
    else if (files.length > 1) loadFiles(files); // bulk: bounded-concurrency queue
  }
  function onChange(e: ChangeEvent<HTMLInputElement>) {
    pick(Array.from(e.target.files ?? []));
    e.target.value = ""; // allow re-selecting the same file(s)
  }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    pick(Array.from(e.dataTransfer.files ?? []));
  }
  function onDragOver(e: DragEvent) {
    e.preventDefault(); // required to allow a drop
    if (!dragging) setDragging(true);
  }
  function onDragLeave(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        onChange={onChange}
        className="hidden"
      />
      <button
        type="button"
        aria-label="Upload one or many tax forms"
        onClick={() => inputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={`flex w-full flex-col items-center gap-4 rounded-card border-2 border-dashed px-8 py-12 transition-colors ${
          dragging
            ? "border-accent bg-[color-mix(in_oklab,var(--accent)_4%,var(--surface))]"
            : "border-line bg-surface hover:border-ink-3"
        }`}
      >
        <span
          className={`flex h-12 w-12 items-center justify-center rounded-full border transition-colors ${
            dragging ? "border-accent text-accent" : "border-line text-ink-2"
          }`}
        >
          <UploadIcon />
        </span>
        <span className="text-xl font-semibold text-ink">
          {dragging ? "Drop to upload" : "Drop your tax forms here"}
        </span>
        <span className="text-base text-ink-2">
          Drag and drop one or many, or click to choose files
        </span>
        <span className="figure text-sm tracking-wide text-ink-2">
          PDF · PNG · JPEG
        </span>
      </button>
    </>
  );
}

function UploadIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M5 16v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3" />
    </svg>
  );
}
