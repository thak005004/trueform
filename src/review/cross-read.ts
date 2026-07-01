import type { W2, SourceRef } from "@/lib/w2-schema";
import { getByPath, type FieldKind } from "@/review/fields";

/**
 * CROSS-READ VERIFICATION (the calibrated-uncertainty signal)
 * -----------------------------------------------------------
 * Tax-math validation only catches fields that are mathematically wrong. A wrong
 * EIN or a transposed digit that stays self-consistent passes the math. So for
 * high-value fields we do an INDEPENDENT second read: crop the field's region
 * from the rendered page and OCR it with Tesseract (local, free, genuinely
 * independent of the primary vision model).
 *
 * IMPORTANT — why "presence", not "equality":
 * The model's source.bbox is an APPROXIMATE estimate and drifts by a line on
 * stacked fields, so a tight crop can land on the wrong text. Instead of cropping
 * tight and demanding the OCR equal the value (which cried wolf — it compared a
 * name against the address below it), we crop GENEROUSLY and check whether the
 * value simply APPEARS anywhere in that region's OCR. Found → the reads agree.
 * Not found (but the region has readable content) → we can't confirm it, so we
 * surface a soft "couldn't confirm — check against the document" review. We never
 * flag when the region has no readable signal at all (pure OCR failure ≠ evidence).
 *
 * The pure presence logic below is unit-tested; the OCR pass runs in the browser.
 */

export interface FieldDisagreement {
  /** Raw OCR of the (generous) region — kept for re-checking after an edit, not shown. */
  ocrText: string;
  kind: FieldKind;
}

export interface CrossReadResult {
  disagreements: Record<string, FieldDisagreement>;
  /** Fields the second read positively CONFIRMED (value found in the region). */
  confirmed: string[];
}

/**
 * Fields worth an independent read. Deliberately ONLY money boxes and IDs: these
 * sit in discrete labeled cells where the model's bbox is reliable enough to crop.
 * Names and addresses are EXCLUDED — they sit in stacked multi-line blocks (name
 * directly above address), where the model's bbox drifts by a line and the crop
 * lands on the wrong text. Cross-reading them produced false disagreements.
 */
export const CROSS_READ_FIELDS: { path: string; kind: FieldKind }[] = [
  { path: "employee.ssn", kind: "id" },
  { path: "employer.ein", kind: "id" },
  { path: "box1_wages", kind: "money" },
  { path: "box2_fedWithholding", kind: "money" },
  { path: "stateLocal.0.stateWages", kind: "money" }, // Box 16
];

// --- presence comparison (pure, testable) --------------------------------
const normText = (s: string) =>
  s.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Integer-dollar values of every number token in the text ("$52,800.00" → 52800). */
const moneyTokens = (s: string): number[] =>
  (s.match(/\d[\d,]*(?:\.\d+)?/g) ?? [])
    .map((t) => Math.round(parseFloat(t.replace(/,/g, ""))))
    .filter((n) => !Number.isNaN(n));

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

/** Does the OCR region contain enough of the right KIND of content to judge at all? */
export function hasReadableSignal(kind: FieldKind, ocrText: string): boolean {
  if (kind === "money") return moneyTokens(ocrText).length > 0;
  if (kind === "id") return /\d/.test(ocrText);
  return /[a-z]/i.test(ocrText);
}

/** Does the model's value appear within the region's OCR text? */
export function valuePresent(kind: FieldKind, modelValue: unknown, ocrText: string): boolean {
  if (modelValue == null || !ocrText.trim()) return false;

  if (kind === "money") {
    const target = Math.round(Number(modelValue));
    if (Number.isNaN(target)) return false;
    return moneyTokens(ocrText).includes(target);
  }
  if (kind === "id") {
    const target = String(modelValue).replace(/\D/g, "");
    const hay = ocrText.replace(/\D/g, "");
    return target.length > 0 && hay.includes(target);
  }
  // text (kept general; not currently in CROSS_READ_FIELDS)
  const target = normText(String(modelValue));
  const hay = normText(ocrText);
  if (!target || !hay) return false;
  if (hay.includes(target)) return true;
  const tol = Math.max(2, Math.floor(target.length * 0.2));
  for (let i = 0; i + target.length <= hay.length; i++) {
    if (levenshtein(hay.slice(i, i + target.length), target) <= tol) return true;
  }
  return false;
}

/**
 * Flag a field when the region has readable content but the value ISN'T in it.
 * No readable signal → not a flag (we simply couldn't verify). Value found → agree.
 */
export function shouldFlag(kind: FieldKind, modelValue: unknown, ocrText: string): boolean {
  return hasReadableSignal(kind, ocrText) && !valuePresent(kind, modelValue, ocrText);
}

// --- OCR pass (browser) --------------------------------------------------
type Bbox = NonNullable<SourceRef["bbox"]>;

// Pad the crop by this multiple of the field's height on every side, so the true
// value stays inside the crop even when the model bbox is off by a line.
const CROP_PAD_FACTOR = 1.75;

let workerPromise: Promise<import("tesseract.js").Worker> | null = null;
async function getWorker() {
  if (!workerPromise) {
    workerPromise = import("tesseract.js").then((t) => t.createWorker("eng"));
  }
  return workerPromise;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode page image for cross-read."));
    img.src = src;
  });
}

/** Crop the bbox region with generous padding and upscale 2× for OCR. */
async function cropRegion(pageDataUrl: string, bbox: Bbox): Promise<string> {
  const img = await loadImage(pageDataUrl);
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const pad = CROP_PAD_FACTOR * bbox.height * H; // one line-height unit, applied on all sides
  const x = Math.max(0, bbox.x * W - pad);
  const y = Math.max(0, bbox.y * H - pad);
  const cw = Math.min(W - x, bbox.width * W + 2 * pad);
  const ch = Math.min(H - y, bbox.height * H + 2 * pad);

  const upscale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(cw * upscale));
  canvas.height = Math.max(1, Math.round(ch * upscale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas context for cross-read crop.");
  ctx.drawImage(img, x, y, cw, ch, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

/**
 * Run the second read over the target fields and return the fields it could not
 * confirm. Compares the ORIGINAL extraction against OCR; fields without a bbox or
 * that are blank are skipped.
 */
export async function runCrossRead(pages: { dataUrl: string }[], w2: W2): Promise<CrossReadResult> {
  const disagreements: Record<string, FieldDisagreement> = {};
  const confirmed: string[] = [];
  const worker = await getWorker();

  for (const { path, kind } of CROSS_READ_FIELDS) {
    const field = getByPath(w2, path);
    if (!field || field.value == null || !field.present) continue;
    const src = field.source;
    if (!src || !src.bbox || pages[src.page] == null) continue;

    try {
      const crop = await cropRegion(pages[src.page].dataUrl, src.bbox);
      const { data } = await worker.recognize(crop);
      const ocrText = data.text.trim();
      if (!hasReadableSignal(kind, ocrText)) continue; // no signal → couldn't verify
      if (valuePresent(kind, field.value, ocrText)) confirmed.push(path);
      else disagreements[path] = { ocrText, kind };
    } catch {
      // A single field's OCR failure shouldn't abort the whole pass.
    }
  }

  return { disagreements, confirmed };
}
