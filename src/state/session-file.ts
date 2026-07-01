import type { PacketDocument, PacketView } from "@/state/document-context";

/**
 * SAVE & RESUME without a database. The whole review session — rendered pages,
 * extractions, corrections, confirmations, audit trail — is plain JSON already,
 * so we serialize it to a downloadable `.trueform.json` and re-import it to pick
 * up exactly where the preparer left off. Persistence without any backend.
 */
export interface SessionFile {
  app: "trueform";
  version: number;
  savedAt: string;
  activeId: string | null;
  view: PacketView;
  documents: PacketDocument[];
}

export function serializeSession(
  documents: PacketDocument[],
  activeId: string | null,
  view: PacketView,
): string {
  const file: SessionFile = {
    app: "trueform",
    version: 1,
    savedAt: new Date().toISOString(),
    activeId,
    view,
    documents,
  };
  return JSON.stringify(file);
}

export function parseSession(json: string): SessionFile {
  const s = JSON.parse(json);
  if (s?.app !== "trueform" || !Array.isArray(s.documents)) {
    throw new Error("This doesn't look like a TrueForm session file.");
  }
  return s as SessionFile;
}

export function downloadSession(
  documents: PacketDocument[],
  activeId: string | null,
  view: PacketView,
) {
  const blob = new Blob([serializeSession(documents, activeId, view)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `trueform-session-${date}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
