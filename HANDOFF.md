# TrueForm — build handoff

Durable context so any fresh session (or machine) can pick this up. Last updated mid-build.

## What this is
Grove take-home: a W-2 extraction tool a **tax preparer** can trust. Product thesis:
**trust is the product, not extraction** — built from (1) verifiable tax math, (2) cross-read
verification [not yet built — a Tier-3 cut], (3) source-linking + fast review. We deliberately
do NOT use model self-reported confidence.

- Product name: **TrueForm**. GitHub repo: `thak005004/trueform`. Hosted: `grove-tax.vercel.app`.
- Pre-built, tested core lives in `src/lib/` (w2-schema, tax-constants, validation, extraction,
  export). **DO NOT modify `src/lib/*`** — import and build around it.

## Stack / how to run
- Next.js 16 (App Router) + TS + Tailwind v4. Build/dev use **webpack** (`next dev/build --webpack`)
  because Turbopack can't resolve the lib's NodeNext `.js` import specifiers; `next.config.ts` sets
  `extensionAlias`.
- `npm run dev` → http://localhost:3000 · `npm test` (13 tests) · `npm run typecheck` · `npm run build`
- `ANTHROPIC_API_KEY` in `.env.local` (gitignored) for local; set in Vercel **Production** for prod.

## What's built (done)
- Upload + browser PDF rasterization (pdfjs, scale 2–3 for legibility) → page viewer.
- `/api/extract` (forced tool-use) + `/api/validate`, both reuse `src/lib` as-is.
- Two-pane review: grouped fields, triage, source-link bbox highlight, inline edit w/ live
  re-validation, confirm-to-verify, audit trail, keyboard loop, edited markers, JSON/CSV export.
- **Client packet** (`src/state/packet-context.tsx`): multi-upload (append + auto-extract),
  dashboard list, drill-in review, **cross-document reconciliation** (`src/review/reconcile.ts`,
  3 tests): totals + SSN/name/address cross-doc flags.
- Hardening: per-doc loading/skeleton states, graceful extraction errors (422/500/network +
  non-W-2 "looks empty" guard) with Retry, **payload fix** (`encodeForApi` sends JPEG ≤1568px so
  the POST body stays under Vercel's ~4.5MB limit; crisp PNG viewer raster untouched).
- UX polish: lighter selected-field highlight, first-run instruction, "?" keyboard legend.

## Design system
Ink-on-paper, IBM Plex Sans/Mono, slate+indigo theme. Tokens in `src/app/globals.css` `:root`.
Status colors (error/review/verified) are the ONLY saturated colors — enforced by convention.

## What's LEFT (in priority order)
1. **DEPLOY TO PROD** — `main` (commit after this) is ahead of what's live. Run `vercel --prod`,
   then verify a real extraction + multi-doc reconciliation on `grove-tax.vercel.app`.
2. **Step C — messy-input test**: run a phone-photo / rotated W-2 through it; screenshot for writeup.
   Broken-W-2 set is in `~/Downloads` (e.g. `w2_A_transposed_box4.pdf`).
3. **Step D — writeup**: what built / cut / key decisions / AI stack / assumptions. Scaffolding in
   the brief (`CLAUDE_CODE_BRIEF.md`).
4. **Step E — final hygiene**: ROTATE the Anthropic API key (it was pasted in plaintext earlier),
   README with hosted URL + repo link, final deploy.

## Deliberate cuts (Tier 3 — writeup "with more time", do NOT half-build):
1099 support, prior-year anomaly detection, second-model cross-read, auth, persistence/DB.

## Deliverables
Hosted URL (no install) + code link + short writeup (time spent, cuts, decisions, AI stack, assumptions).
