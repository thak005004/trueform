"use client";

import { useReview } from "@/review/review-context";

// Short labels for the cross-read fields (all we ever surface here).
const LABELS: Record<string, string> = {
  "employee.ssn": "SSN",
  "employer.ein": "EIN",
  box1_wages: "Box 1",
  box2_fedWithholding: "Box 2",
  "stateLocal.0.stateWages": "Box 16",
};

/**
 * Document-level read-confidence banner. Speaks only from the EMPIRICAL second
 * read (not model self-confidence): if the independent reader struggled, we say
 * so and point the preparer at what to double-check — including the text fields
 * the tax math can't guard, which is exactly where a bad scan degrades silently.
 */
export function ReadConfidenceBanner() {
  const r = useReview();
  const c = r.readConfidence;
  if (c.level === "clear") return null;

  const jump = (path: string) => {
    r.select(path);
    r.focusPath(path);
  };

  return (
    <div className="border-b border-line bg-review-bg px-4 py-2.5">
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
        <div className="min-w-0">
          {c.level === "low" ? (
            <p className="text-[13px] leading-snug text-review">
              <span className="font-semibold">Low-confidence scan.</span> The independent second read
              verified only {c.confirmed} of {c.candidates} key fields — likely a low-resolution or noisy
              image. Double-check the <span className="font-medium">text fields (name, address)</span>,
              which the tax math can&rsquo;t guard.
            </p>
          ) : (
            <p className="text-[13px] leading-snug text-review">
              <span className="font-semibold">
                Second read couldn&rsquo;t confirm {c.unconfirmed.length} field
                {c.unconfirmed.length === 1 ? "" : "s"}.
              </span>{" "}
              Verify {c.unconfirmed.length === 1 ? "it" : "them"} against the document.
            </p>
          )}

          {c.unconfirmed.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {c.unconfirmed.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => jump(p)}
                  className="rounded border border-review/40 px-1.5 py-0.5 text-[11px] font-medium text-review hover:bg-review/10"
                >
                  {LABELS[p] ?? p} &rarr;
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
