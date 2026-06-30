# TrueForm — writeup

> Draft — fill in time spent and adjust voice as you like.

**Live:** https://grove-tax.vercel.app · **Repo:** https://github.com/thak005004/trueform

## What I built

A W-2 extraction and review tool for a tax preparer. Upload a client's W-2s, get structured data,
and — the actual point — a fast, trustworthy way to verify and correct it before it goes downstream.

The trust layer is three independent checks, none of which rely on the model's opinion of itself:

1. **Verifiable tax math.** Box 4 = 6.2% of (Box 3 + Box 7), capped at the SS wage base; Box 6 =
   1.45% of Box 5 plus the 0.9% Additional Medicare surtax over $200k; the SS wage cap; deferral
   reconciliation between Box 1 and Box 5 via Box 12 codes; SSN/EIN format; withholding plausibility.
2. **Cross-read verification.** For high-value fields (names, SSN, EIN, key money boxes) a separate
   Tesseract OCR pass reads the field's exact region off the document and is compared to the model's
   read. Disagreement is surfaced with both candidates to pick from.
3. **Cross-document reconciliation.** A client packet rolls up totals and flags inconsistencies —
   the same SSN under different names (a likely misfiled form), or different SSNs in one packet.

Supporting features: in-browser PDF rasterization, source-linking (click a field → highlight where
it came from), inline editing with live re-validation, confirm-to-verify with an audit trail, a
keyboard loop to clear a form without the mouse, and box-keyed JSON/CSV export of the corrected data.

## Key decisions and tradeoffs

- **Trust from observable signals, not model confidence.** Every flag is arithmetic, a format rule,
  cross-field reconciliation, or a disagreement between two independent reads. None of it is the
  model's self-reported confidence, which is poorly calibrated — a model reports high confidence on a
  transposed digit. This is the core thesis and everything ladders to it.
- **The deliberate Box 1 ≠ Box 5 non-flag.** Those boxes legitimately differ (pre-tax 401(k), the SS
  cap). Flagging normal forms trains a preparer to ignore the tool, so TrueForm reconciles the gap
  against the Box 12 deferral codes and confirms it instead.
- **Constrained the AI to a typed schema + deterministic validation.** Extraction uses forced tool
  use where the tool's input schema *is* the W-2 zod schema, then re-validates with zod. A preparer
  can't trust unvalidated free-text extraction.
- **Hand-verified tax constants** (SS wage base / rates, 2021–2026) live in code, not model recall —
  correctness there has to be auditable.
- **Cross-read favors silence over noise.** A shaky OCR read (unparseable number, wrong digit count)
  is treated as "couldn't verify," not a disagreement, so the feature doesn't cry wolf.
- **Payload safety for prod.** The API image copy is JPEG-encoded and downscaled to ~1568px (what the
  vision model downsizes to anyway), keeping requests well under Vercel's ~4.5MB limit; the crisp
  viewer raster is untouched.

## AI stack, and where I used / overrode / avoided it

- **Claude Code** built the app — scaffolding, UI, API routes, tests, deploys.
- **Anthropic vision** does the primary extraction (forced tool use).
- **Tesseract** (open-source OCR) is the independent second reader for cross-read — local, free, and
  genuinely independent of the primary model.
- **Where I overrode the AI:** forced free-text into a typed schema; added deterministic validation;
  refused to trust self-reported confidence; hand-verified the tax constants.
- **Where I chose NOT to use AI:** the validation rules, tax constants, and reconciliation are plain
  deterministic code, because correctness there must be auditable, not probabilistic.

## What I chose not to build (and would, with more time)

Deliberate cuts to ship a tight, trustworthy build rather than a sprawling one:

- **1099 and other forms** — scoped to W-2 to get the trust layer right on one form.
- **Prior-year anomaly detection** — flag year-over-year jumps; needs stored history.
- **A second *model* cross-read** — Tesseract is the independent reader today; a second vision model
  would be a stronger (but slower, paid) check, configurable per the cost/latency tradeoff.
- **Auth / multi-user and persistence / a database** — data lives in-session only, which also keeps
  sensitive tax data from lingering.
- **Latency:** long extractions run one-shot; a busy packet would benefit from queueing/streaming.
- **Bbox accuracy** for source-linking is model-approximate; padded + snippet fallback today.

## Assumptions

US W-2s, tax years 2021–2026, common web image formats (PDF/PNG/JPEG), roughly one form per file.
HEIC and handwriting are out of scope.

## Time spent

_~__ hours._ <!-- fill in -->
