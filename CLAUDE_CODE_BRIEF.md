# Grove Take-Home — Build Brief

> Paste this as your opening message to Claude Code. I (the developer) am directing this
> build and must be able to explain every decision in a follow-up call. **Keep code readable,
> comment non-obvious choices, and prefer simple over clever.** Don't over-engineer.

---

## 1. What this is
A tool where a **tax preparer** uploads W-2s and gets back **structured data they can trust
and push into tax software**. Single most important sentence in the prompt:
*"an experience a tax preparer can use and trust."*

## 2. Product thesis — everything ladders to this
**Trust is the product, not extraction.** Calling a vision model on a PDF is table stakes.
The differentiator is letting a preparer *verify and correct fast, and know exactly what to
double-check*. Trust here is built from three things, in order:
1. **Verifiable tax math** (the W-2 must internally reconcile).
2. **Cross-read verification** (two independent reads must agree).
3. **Source-linking + fast review** (one-glance check against the document).

We deliberately **do not use the model's self-reported confidence** — it's poorly calibrated;
a model reports high confidence on a transposed digit. Every flag comes from something
*observable*, not the model's opinion of itself. This is the core philosophy; preserve it.

## 3. The backend core is ALREADY BUILT — import it, do not rewrite it
In `src/lib/` (typechecked, 10 passing tests via `npm test`):
- `w2-schema.ts` — typed W-2 schema (zod). Every field carries `source` grounding: a
  normalized 0..1 `bbox` + printed `snippet`, for source-linking. `present` distinguishes a
  genuinely-blank box from an unreadable one.
- `tax-constants.ts` — year-indexed SS wage base / rates, 2021–2026, SSA-verified.
- `validation.ts` — `validateW2(w2)` → `{ issues, byField, summary }`. Issues are
  error/warning/info, each tied to a field path; this drives triage. Rules include: Box 4 =
  6.2% of (Box 3 + Box 7) capped at the wage base; Box 6 = 1.45% of Box 5 **plus 0.9%
  Additional Medicare over $200k**; wage-cap ceiling; deferral reconciliation (Box 5 − Box 1
  vs Box 12 codes); SSN/EIN sanity; withholding plausibility.
- `extraction.ts` — `extractW2(pages)` → typed extraction via **forced Anthropic tool use**
  (the tool's input schema IS the zod schema), re-validated with zod.
- `export.ts` — `toRecord` / `toJSON` / `toCSV`, box-keyed for downstream import.

**Rules when extending:** never add confidence-based flags; never flag Box1≠Box3≠Box5 as an
error (they legitimately differ — pre-tax deferrals, SS cap).

## 4. Stack
- Next.js (App Router) + TypeScript + Tailwind. Deploy on **Vercel**.
- `@anthropic-ai/sdk`; `ANTHROPIC_API_KEY` in `.env.local`.
- PDF → image: rasterize **in the browser** with `pdfjs-dist` (canvas → PNG dataURL), then
  POST images to the API. Avoids native-dep pain on serverless.
- Independent OCR for cross-read: **`tesseract.js`** (pure JS, no native deps).
- Storage: in-memory / session only. **No database.** Optionally Vercel Blob for the raw file.

## 5. Non-negotiable quality bars (these separate "best" from "fine")

### 5a. Real-world extraction robustness
Trust dies the first time it confidently misreads a phone photo. Build and test for messy
inputs, not just clean IRS samples:
- **Rasterize at sufficient resolution** — render the PDF at scale ≈ 2.0–3.0 (≈150–220 DPI
  equivalent). Small-font boxes vanish at low DPI; this is the #1 silent accuracy killer.
- Accept **PDF, PNG, JPEG**. Handle a rotated/skewed/low-contrast photo gracefully.
- Multi-page documents: pass all page images in one extraction call.
- (HEIC and handwriting are explicitly out of scope — state as an assumption.)

### 5b. The fast verification loop
Grove's pitch: preparers spend most of their time *not* doing taxes. The product's value is
ripping through a stack. Make review keyboard-fast:
- Top summary bar: `2 need review · 0 errors · 14 verified`.
- Flagged fields (error → red, review → amber) are foregrounded; `ok` fields collapse.
- **Keyboard nav:** jump to next flagged field, edit inline, `Enter` to confirm, a shortcut
  to export. A preparer should clear a form without reaching for the mouse.
- Confirming a field marks it human-verified (→ audit trail) and turns it green. When all
  flags are cleared, surface a clear **"ready to export"** state.

## 6. Cross-read verification (the new trust feature — spec)
**Problem it solves:** tax-math validation only catches fields that are *mathematically*
wrong. A misread name, a wrong EIN, or a transposed digit that happens to stay self-consistent
passes the math. We need a calibrated uncertainty signal for *those* fields.

**Design:** for high-value fields, do an **independent second read** and **flag disagreement**.
- Target fields: employee name, SSN, employer name, EIN, and the key money boxes (1, 2, 16).
- Independent read = crop the field's `bbox` region from the rendered page canvas and run
  **`tesseract.js`** on the crop. (Optionally, a second pass with a different model — make it
  configurable; note the cost/latency tradeoff in the writeup. Default to Tesseract: local,
  cheap, and genuinely independent of the primary model.)
- Compare normalized values: numbers stripped of `$ , ` and compared exactly; text uppercased,
  whitespace-collapsed, compared with a small edit-distance tolerance (Tesseract isn't perfect).
- **On disagreement:** emit a `review`-severity issue ("two reads disagree: '52,000' vs
  '52,800' — confirm against source"), show BOTH candidates, let the preparer pick one with a
  click/keystroke. Never auto-reject; disagreement routes a human's eye, it doesn't decide.
- **Why this is honest (and your best AI-stack-override story):** disagreement between two
  independent reads is *empirical* uncertainty, unlike a model's self-reported confidence.
  Agreement raises trust; disagreement is exactly where a preparer's attention should go.

Implementation note: run cross-read after extraction+validation, merge its issues into the
same `byField` triage structure so the UI treats them uniformly.

## 7. Build order (do in sequence — don't skip step 1)
1. **Scaffold + deploy hello-world to Vercel FIRST.** Lock the hosted URL before features.
2. **Upload + render** (PDF/image → page PNGs at proper DPI) + document viewer pane.
3. **Extract:** `POST /api/extract` → `extractW2` → `validateW2`; return data + issues.
4. **Cross-read verification** (§6); merge issues into triage.
5. **Review UI (the core):** doc pane + fields pane, triage, source-linking on field click
   (highlight `bbox`, fall back to `snippet` if null), inline editing that re-runs validation
   live, confirm-to-verify, audit trail of edits `{field, old, new, at}`, keyboard loop (§5b).
6. **Export:** JSON + CSV buttons via `export.ts`. Label them box-keyed for downstream.
7. **Polish + test** with 3–4 real samples (see §9).
8. **Stretch — cross-document reconciliation** (§8), only if 1–7 are solid.

## 8. Stretch: cross-document reconciliation
Upload several W-2s as one **client packet**. Produce a client-level summary (total Box 1,
total Box 2) and flag cross-doc inconsistencies: the same SSN should carry the same employee
name/address; differing SSNs across one "client" packet is a warning. This signals you
understand a preparer processes a *packet*, not a single form.

## 9. Test plan / sample data
- Clean: the IRS blank Form W-2 PDF + a filled sample.
- **Synthetic, to demonstrate the trust layer firing on purpose:**
  - a **>$200k earner** → Additional Medicare check engages;
  - a **401(k) deferral** case (Box 1 < Box 5, Box 12 code D) → must NOT false-flag;
  - a **transposed Box 4** → math check catches it;
  - a **misread-prone field** (tight crop / low contrast) → cross-read disagreement fires.
- Messy: a rotated/low-contrast photo of a W-2 to prove robustness.

## 10. Guardrails
- `.env.local` gitignored; **secrets sweep before pushing public** — no keys in git history.
- Scope discipline beats breadth. **Deliberately cut and write it down:** multi-form
  generality, auth/multi-user, a database, real vendor integrations, handwriting/HEIC.
- Every feature must ladder to trust + the preparer's real workflow. If it doesn't, cut it.

## 11. Writeup scaffolding (fill in as you build)
- **What I built / what I cut** (and *why* the cuts are the right call).
- **Key decision — trust from observable signals, not model confidence:** tax math +
  cross-read disagreement; the deliberate Box1≠Box5 non-flag; verifying wage-base numbers by
  hand instead of trusting model recall.
- **Domain depth:** Additional Medicare surtax; deferral reconciliation; wage-cap ceiling.
- **AI stack (be honest):** Claude Code to build; vision model for extraction; Tesseract for
  the independent read. Where you **overrode** the AI: constrained free-text → typed schema,
  added validation, refused to trust self-reported confidence, hand-verified tax constants.
  Where you **chose not to** use AI: the validation rules and tax constants are
  deterministic code, not a model call, because correctness there must be auditable.
- **With more time:** 1099 support, prior-year anomaly detection, per-vendor export adapters,
  bbox/robustness improvements, a second-model cross-read.
- **Assumptions:** US W-2s, tax years 2021–2026, common web image formats, ~one form per file
  to start.
