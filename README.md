# TrueForm — W-2 extraction a tax preparer can trust

A tool where a tax preparer uploads a client's W-2s and gets back **structured data they can
trust** and push into tax software downstream.

- **Live:** https://grove-tax.vercel.app
- **Code:** https://github.com/thak005004/trueform

> Product thesis: **trust is the product, not extraction.** Calling a vision model on a PDF is
> table stakes. The value is letting a preparer *verify and correct fast, and know exactly what to
> double-check.* Trust here is built from observable signals — verifiable tax math, source-linking,
> cross-document reconciliation — **never** the model's self-reported confidence (poorly calibrated:
> a model reports high confidence on a transposed digit).

## Quick start

```bash
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local   # your key
npm run dev        # http://localhost:3000
npm test           # 13 tests (validation + reconciliation)
npm run typecheck
npm run build
```

## What it does

1. **Upload** a W-2 (PDF / PNG / JPEG). PDFs rasterize in the browser via `pdfjs` at ~2–3× scale so
   small box text stays legible (low DPI is the #1 silent extraction-accuracy killer).
2. **Extract** via Anthropic vision with **forced tool use** — the tool's input schema *is* the zod
   W-2 schema — then re-validated with zod. Free-text is never trusted; output is a typed schema.
3. **Validate** with deterministic, auditable tax math (`src/lib/validation.ts`): Box 4 = 6.2% of
   (Box 3 + Box 7) capped at the SS wage base; Box 6 = 1.45% of Box 5 + 0.9% Additional Medicare over
   $200k; deferral reconciliation; SSN/EIN sanity; withholding plausibility.
4. **Review** in a two-pane UI: document (source of truth) + grouped, triaged fields. Click a field to
   highlight its source region; edit inline to re-validate live; confirm to mark human-verified; full
   audit trail; keyboard loop to clear a form without the mouse; export JSON/CSV (box-keyed).
5. **Packet + reconciliation:** add several W-2s as a client packet → dashboard with rolled-up totals
   and **cross-document flags** (same SSN with different names/addresses; different SSNs in one packet).

## Key decisions & tradeoffs

- **Trust from verifiable signals, not model confidence.** Every flag is arithmetic, a format rule, or
  cross-field/cross-doc reconciliation — auditable code, not a model call. We deliberately do **not**
  flag Box 1 ≠ Box 3 ≠ Box 5 as an error (they legitimately differ: pre-tax deferrals, the SS cap).
- **Constrained the AI to a typed schema + validation.** A preparer can't trust unvalidated extraction,
  so model output is forced into the W-2 schema and re-checked.
- **Hand-verified tax constants** (SS wage base / rates 2021–2026) live in deterministic code, not model
  recall — correctness there must be auditable.
- **Source-linking degrades gracefully.** Vision bbox accuracy is approximate; highlights are padded
  generously and fall back to the printed snippet when no bbox is returned.
- **Payload safety (prod).** The API copy of each page is JPEG-encoded and downscaled to ≤1568px (what
  the model downsizes to anyway), keeping the request well under Vercel's ~4.5MB limit. The crisp
  full-res raster used by the viewer + highlighting is untouched.
- **Build tooling.** The pre-built `src/lib` core uses NodeNext `.js` import specifiers; the app builds
  with webpack + `extensionAlias` to resolve them without modifying the tested core.

## AI stack (honest)

- **Claude Code** to build the app (scaffold, UI, API routes, tests, deploy).
- **Anthropic vision model** for extraction (forced tool use).
- **Where I overrode the AI:** constrained free-text → typed schema; added deterministic validation;
  refused to trust self-reported confidence; hand-verified the tax constants instead of model recall.
- **Where I chose not to use AI:** the validation rules, tax constants, and reconciliation are plain
  deterministic code, because correctness there must be auditable, not probabilistic.

## Assumptions

US W-2s, tax years 2021–2026, common web image formats, roughly one form per file. HEIC and handwriting
are out of scope.

## What I cut (and would do with more time)

Deliberately scoped out to ship a tight, trustworthy build: **1099 support**, **prior-year anomaly
detection**, a **second-model cross-read** (a genuinely independent OCR/model pass to flag misreads that
stay self-consistent), **auth/multi-user**, and **persistence/a database**. Each is a real chunk; naming
them as deliberate cuts beats half-building one. Also: queue/stream long extractions (a busy packet can
approach the function timeout), and improve bbox accuracy.

## Project layout

- `src/lib/*` — pre-built, tested core (schema, tax constants, validation, extraction, export). **Not modified.**
- `src/app/api/{extract,validate}` — server routes that reuse the core.
- `src/state/packet-context.tsx` — client-packet state (documents, active doc, reconciliation source).
- `src/review/*` — field config, review state, `reconcile.ts` (+ tests), export helpers.
- `src/components/*` — review UI, dashboard, document viewer.
