"use client";

import type { PacketDocument } from "@/state/document-context";
import { PageStack } from "./PageStack";

/**
 * FAIL-SAFE view for a document the classifier could not confidently identify.
 * On-thesis: TrueForm never trusts the model blindly, and a misclassification
 * would run the wrong form's tax rules on a return. So instead of guessing, an
 * unknown form is surfaced to the preparer with the document itself to eyeball —
 * the safe failure, not a confident wrong answer.
 */
export function UnidentifiedForm({ doc }: { doc: PacketDocument }) {
  return (
    <div className="h-full overflow-auto bg-paper">
      <div className="px-4 pt-4">
        <div className="mx-auto max-w-3xl rounded-card border border-review/40 bg-review-bg px-4 py-3">
          <div className="flex items-start gap-2.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-review" aria-hidden>
              <path d="M10.3 3.3 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0Z" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-review">Couldn&rsquo;t identify this form &mdash; sent to human review.</p>
              <p className="mt-1 text-[13px] leading-snug text-review">
                TrueForm only extracts a form once it&rsquo;s confident which one it is (currently W-2 and 1099-NEC). This document didn&rsquo;t match confidently, so rather than guess and run the wrong tax rules, it&rsquo;s flagged for you to check.
                {doc.classification?.note ? <> <span className="text-ink-2">Classifier note: {doc.classification.note}</span></> : null}
              </p>
            </div>
          </div>
        </div>
      </div>
      <PageStack pages={doc.pages} />
    </div>
  );
}
