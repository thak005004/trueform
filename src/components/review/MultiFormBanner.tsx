"use client";

import { usePacket } from "@/state/document-context";

/**
 * Warns when the uploaded page holds more than one person's W-2. TrueForm reviews
 * one form per document, so without this the second person would vanish silently
 * — the one thing the trust thesis can't allow. This is the honest guardrail
 * (detect + tell the preparer what to do), not full multi-form extraction. It
 * speaks only when the scan actually found more than one distinct employee.
 */
export function MultiFormBanner() {
  const { active } = usePacket();
  const scan = active?.formScan;
  if (!scan || scan.distinctEmployees <= 1) return null;

  // The person currently on screen (post-edit draft, else the raw extraction).
  const shown =
    active?.draft?.employee.name.value ??
    active?.extraction?.w2.employee.name.value ??
    null;
  const others = scan.employees.filter((n) => n && n !== shown);
  const plural = scan.distinctEmployees > 2;

  return (
    <div className="border-b border-review/40 bg-review-bg px-4 py-2.5">
      <div className="flex items-start gap-2">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mt-0.5 shrink-0 text-review"
          aria-hidden
        >
          <path d="M10.3 3.3 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0Z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
        <p className="text-[13px] leading-snug text-review">
          <span className="font-semibold">
            This file appears to contain {scan.distinctEmployees} W-2s for different people.
          </span>{" "}
          TrueForm reviews one form per document
          {shown ? (
            <>
              , so only <span className="font-medium">{shown}</span> is shown here
            </>
          ) : null}
          . Upload the other form{plural ? "s" : ""} separately to review{" "}
          {others.length ? others.join(", ") : plural ? "them" : "it"}.
        </p>
      </div>
    </div>
  );
}
