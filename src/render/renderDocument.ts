/**
 * RENDER MODULE (client-only)
 * ---------------------------
 * Turns an uploaded file (PDF / PNG / JPEG) into an in-memory array of page
 * rasters. This array — RenderedPage[] — is the shared "rendered document" that
 * every later step consumes:
 *   - the viewer pane shows each page's `dataUrl`
 *   - extraction strips `dataUrl` → base64 to feed the core `extractW2`
 *   - source-linking maps a 0..1 bbox onto `width`/`height` to draw a highlight
 *
 * Everything here runs in the browser. We never touch the network or a server.
 */

export interface RenderedPage {
  /** PNG (rasterized PDF) or the original image, as a `data:` URL. <img src> + extraction source. */
  dataUrl: string;
  /** Intrinsic pixel size of the raster. Needed so a normalized (0..1) bbox can be mapped to pixels later. */
  width: number;
  height: number;
}

/**
 * pdf.js renders at scale 1.0 ≈ 72 DPI. That is FAR too low for a W-2: the small
 * box labels and dollar amounts blur into noise, and that is the #1 silent killer
 * of downstream extraction accuracy (the model misreads a smudge with full
 * confidence). We render in the 2.0–3.0 range (≈150–220 DPI), nudging toward the
 * high end on hi-DPI screens for crispness, but CLAMP the result so a 3x phone
 * display doesn't blow up canvas memory and the eventual API image payload.
 */
const MIN_RENDER_SCALE = 2.0;
const MAX_RENDER_SCALE = 3.0;

function pageRenderScale(): number {
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  return Math.min(MAX_RENDER_SCALE, Math.max(MIN_RENDER_SCALE, MIN_RENDER_SCALE * dpr));
}

/**
 * Lazily load pdf.js and wire its Web Worker — the classic Next.js gotcha.
 *
 * pdf.js does its parsing/rendering in a Worker. If the worker URL is wrong,
 * pdf.js does NOT error: it silently falls back to a "fake worker" on the main
 * thread, which freezes the UI on real PDFs and behaves subtly differently. So
 * we wire the real worker explicitly via `new Worker(new URL(..., import.meta.url))`
 * — the form both Turbopack and webpack recognize and fingerprint, which keeps the
 * worker locked to the installed pdfjs-dist version (no CDN/version-skew surprises).
 *
 * We import pdf.js dynamically (not at module top-level) so it is never evaluated
 * during server-side rendering — it only loads in the browser, on first use.
 */
let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;
function loadPdfjs(): Promise<typeof import("pdfjs-dist")> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerPort = new Worker(
        new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url),
        { type: "module" },
      );
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

/** Dispatch on file type. PDFs rasterize per-page; images pass through as a single page. */
export async function renderDocument(file: File): Promise<RenderedPage[]> {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (isPdf) return renderPdf(file);
  if (file.type === "image/png" || file.type === "image/jpeg") return [await renderImage(file)];
  throw new Error(
    `Unsupported file type "${file.type || "unknown"}". Please upload a PDF, PNG, or JPEG.`,
  );
}

async function renderPdf(file: File): Promise<RenderedPage[]> {
  const pdfjs = await loadPdfjs();
  const data = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;
  const scale = pageRenderScale();

  try {
    const pages: RenderedPage[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);

      // pdf.js v6 takes the canvas directly and creates its own 2D context.
      await page.render({ canvas, viewport }).promise;
      pages.push({
        dataUrl: canvas.toDataURL("image/png"),
        width: canvas.width,
        height: canvas.height,
      });
      page.cleanup();
    }
    return pages;
  } finally {
    // `destroy()` lives on the loading task (tears down the worker), not the document.
    await loadingTask.destroy();
  }
}

async function renderImage(file: File): Promise<RenderedPage> {
  const dataUrl = await readAsDataUrl(file);
  const { width, height } = await intrinsicSize(dataUrl);
  return { dataUrl, width, height };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read the uploaded file."));
    reader.readAsDataURL(file);
  });
}

function intrinsicSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Could not decode the uploaded image."));
    img.src = dataUrl;
  });
}
