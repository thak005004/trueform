"use client";

/**
 * Compatibility shim. The single-form "document" state is now the ACTIVE
 * document of a client packet (see packet-context). Existing components import
 * DocumentProvider / useDocument from here unchanged; both are backed by the
 * packet now. New code can import usePacket / PacketDocument directly.
 */

export {
  PacketProvider as DocumentProvider,
  useActiveDocument as useDocument,
  usePacket,
} from "./packet-context";

export type {
  ExtractResult,
  PacketDocument,
  PacketView,
  AuditEntry,
  ActiveDocumentView,
} from "./packet-context";
