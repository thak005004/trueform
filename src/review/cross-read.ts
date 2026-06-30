import type { W2, SourceRef } from "@/lib/w2-schema";
import { formatValue, getByPath, type FieldKind } from "@/review/fields";

/**
 * CROSS-READ VERIFICATION (the calibrated-uncertainty signal)
 * -----------------------------------------------------------
 * Tax-math validation only catches fields that are mathematically wrong. A
 * misread name, a wrong EIN, or a transposed digit that stays self-consistent
 * passes the math. So for high-value fields we do an INDEPENDENT second read:
 * crop the field's source bbox from the rendered page and OCR it with Tesseract
 * (local, free, and genuinely independent of the primary vision model). If the
 * two reads disagree, that's EMPIRICAL uncertainty — unlike the model's
 * self-reported confidence — and exactly where a preparer should look.
 *
 * We never auto-reject: a disagreement routes a human's eye and shows BOTH
 * candidates. The comparison favors NOT flagging unless clearly different, so a
 * shaky OCR read doesn't spam false positives (which would erode trust).
 *
 * This file's pure compare logic (`disagree`) is unit-tested; the OCR pass runs
 * in the browser.
 */

export interface FieldDisagreement {
  modelDisplay: string; // the primary model's value, formatted
  ocrText: string; // the raw second-read text
  kind: FieldKind;
}

export interface CrossReadResult {
  disagreements: Record<string, FieldDisagreement>;
}

/** High-value fields worth an independent read: identity + the key money boxes. */
export const CROSS_READ_FIELDS: { path: string; kind: FieldKind }[] = [
  { path: "employee.name", kind: "text" },
  { path: "employee.ssn", kind: "id" },
  { path: "employer.name", kind: "text" },
  { path: "employer.ein", kind: "id" },
  { path: "box1_wages", kind: "money" },
  { path: "box2_fedWithholding", kind: "money" },
  { path: "stateLocal.0.stateWages", kind: "money" }, // Box 16
];

// --- normalization + comparison (pure, testable) -------------------------
const moneyDollars = (s: string): number | null => {
  const m = s.replace(/[^0-9.]/g, "");
  if (!m) return null;
  const n = parseFloat(m);
  return Number.isNaN(n) ? null : Math.round(n);
};
const digitsOnly = (s: string) => s.replace(/\D/g, "");
const normText = (s: string) =>
  s.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

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

/**
 * Do the two reads disagree? Conservative by design — when the second read is
 * unusable (unparseable number, wrong digit count for an ID), we return false
 * (can't verify) rather than crying wolf.
 */
export function disagree(kind: FieldKind, modelValue: unknown, ocrText: string): boolean {
  if (modelValue == null || !ocrText.trim()) return false;

  if (kind === "money") {
    const a = moneyDollars(String(modelValue));
    const b = moneyDollars(ocrText);
    if (a == null || b == null) return false;
    return a !== b;
  }
  if (kind === "id") {
    const a = digitsOnly(String(modelValue));
    const b = digitsOnly(ocrText);
    // Only compare when OCR produced the same number of digits — otherwise it
    // likely just misfired, and we shouldn't flag.
    if (!a || !b || a.length !== b.length) return false;
    return a !== b;
  }
  // text: tolerate a couple of OCR slips proportional to length.
  const a = normText(String(modelValue));
  const b = normText(ocrText);
  if (!a || !b) return false;
  const tolerance = Math.max(2, Math.floor(a.length * 0.2));
  return levenshtein(a, b) > tolerance;
}

// --- OCR pass (browser) --------------------------------------------------
type Bbox = NonNullable<SourceRef["bbox"]>;

// One shared Tesseract worker, created on first use.
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

/** Crop the bbox region (padded — bboxes are approximate) and upscale 2× for OCR. */
async function cropRegion(pageDataUrl: string, bbox: Bbox): Promise<string> {
  const img = await loadImage(pageDataUrl);
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const padX = bbox.width * W * 0.18;
  const padY = bbox.height * H * 0.35;
  const x = Math.max(0, bbox.x * W - padX);
  const y = Math.max(0, bbox.y * H - padY);
  const cw = Math.min(W - x, bbox.width * W + 2 * padX);
  const ch = Math.min(H - y, bbox.height * H + 2 * padY);

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
 * Run the second read over the target fields and return only the disagreements.
 * Compares the ORIGINAL extraction against OCR; fields without a bbox (can't
 * locate) or that are blank are skipped.
 */
export async function runCrossRead(pages: { dataUrl: string }[], w2: W2): Promise<CrossReadResult> {
  const disagreements: Record<string, FieldDisagreement> = {};
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
      if (disagree(kind, field.value, ocrText)) {
        disagreements[path] = { modelDisplay: formatValue(field, kind), ocrText, kind };
      }
    } catch {
      // A single field's OCR failure shouldn't abort the whole pass.
    }
  }

  return { disagreements };
}
