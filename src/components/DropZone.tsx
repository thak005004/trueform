"use client";

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useDocument } from "@/state/document-context";

const ACCEPT = "application/pdf,image/png,image/jpeg";

/**
 * The upload target card: BOTH click-to-upload and drag-and-drop, funnelling
 * into the same `loadFile` render pipeline as the header button. Sits inside the
 * IntroScene, so this component is just the card (its parent handles layout).
 */
export function DropZone() {
  const { loadFile } = useDocument();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function pick(file: File | undefined) {
    if (file) loadFile(file);
  }
  function onChange(e: ChangeEvent<HTMLInputElement>) {
    pick(e.target.files?.[0]);
    e.target.value = ""; // allow re-selecting the same file
  }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files?.[0]);
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
        onChange={onChange}
        className="hidden"
      />
      <button
        type="button"
        aria-label="Upload a W-2 file"
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
            dragging ? "border-accent text-accent" : "border-line text-ink-3"
          }`}
        >
          <UploadIcon />
        </span>
        <span className="text-base font-medium text-ink">
          {dragging ? "Drop to upload" : "Drop your W-2 here"}
        </span>
        <span className="text-sm text-ink-2">
          Drag and drop, or click to choose a file
        </span>
        <span className="figure text-xs tracking-wide text-ink-3">
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
