"use client";

import { useEffect, useMemo, useState } from "react";
import { useReview } from "@/review/review-context";
import { usePacket } from "@/state/document-context";
import { buildGroups } from "@/review/fields";
import { downloadCSV, downloadJSON } from "@/review/export-download";

interface Item {
  id: string;
  kind: "action" | "field";
  label: string;
  hint: string;
  run: () => void;
}

/**
 * ⌘K command palette: type to jump to any box or run an action (export, print
 * summary, back to packet). Power-user navigation over the review.
 */
export function CommandPalette() {
  const r = useReview();
  const { documents, openDashboard } = usePacket();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setQ("");
        setIdx(0);
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const items = useMemo<Item[]>(() => {
    const actions: Item[] = [
      { id: "act:json", kind: "action", label: "Export JSON", hint: "Action", run: () => downloadJSON(r.w2, r.audit) },
      { id: "act:csv", kind: "action", label: "Export CSV", hint: "Action", run: () => downloadCSV(r.w2) },
      { id: "act:print", kind: "action", label: "Print client summary", hint: "Action", run: () => window.print() },
    ];
    if (documents.length > 1) {
      actions.push({ id: "act:dashboard", kind: "action", label: "Back to packet dashboard", hint: "Action", run: openDashboard });
    }
    const fields: Item[] = buildGroups(r.w2).flatMap((g) =>
      g.fields.map((f) => ({
        id: `field:${f.path}`,
        kind: "field" as const,
        label: `${f.box ? f.box + " · " : ""}${f.label}`,
        hint: g.title,
        run: () => {
          r.select(f.path);
          r.focusPath(f.path);
        },
      })),
    );
    return [...actions, ...fields];
  }, [r, documents.length, openDashboard]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((it) => it.label.toLowerCase().includes(s) || it.hint.toLowerCase().includes(s));
  }, [q, items]);

  if (!open) return null;

  const run = (i: number) => {
    const it = filtered[i];
    if (it) {
      it.run();
      setOpen(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-[12vh]"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-card border border-line bg-surface shadow-[0_12px_40px_rgba(22,32,46,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setIdx(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIdx((i) => Math.min(i + 1, filtered.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIdx((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              run(idx);
            }
          }}
          placeholder="Jump to a box or run an action…"
          className="w-full border-b border-line bg-surface px-4 py-3 text-sm text-ink outline-none"
        />
        <ul className="max-h-72 overflow-auto py-1">
          {filtered.length === 0 && <li className="px-4 py-3 text-sm text-ink-3">No matches</li>}
          {filtered.map((it, i) => (
            <li key={it.id}>
              <button
                type="button"
                onMouseEnter={() => setIdx(i)}
                onClick={() => run(i)}
                className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm ${
                  i === idx ? "bg-paper" : ""
                }`}
              >
                <span className="text-ink">{it.label}</span>
                <span className="text-[11px] text-ink-3">{it.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
