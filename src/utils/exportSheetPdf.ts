/**
 * Load html2canvas and jsPDF with string-literal dynamic import().
 * Vite's @vite-ignore only works with a literal URL (not a variable), or
 * resolution fails for missing node_modules packages.
 * Pinned ESM; first PDF download hits the network, then cache.
 */

type H2C = (element: HTMLElement, o: Record<string, unknown>) => Promise<HTMLCanvasElement>;
type JSPdf = new (opt?: { unit: string; format: string; orientation: string }) => {
  internal: { pageSize: { getWidth: () => number; getHeight: () => number } };
  addImage: (data: string, type: string, x: number, y: number, w: number, h: number) => void;
  addPage: () => void;
  save: (name: string) => void;
};

let loadPromise: Promise<{ html2canvas: H2C; jsPDF: JSPdf }> | null = null;

function loadExportLibs() {
  if (loadPromise) {
    return loadPromise;
  }
  loadPromise = (async () => {
    // String literals in import() only (no variables). @ts-ignore: not resolvable as TS project modules.
    const [h2cMod, jm] = await Promise.all([
      // @ts-ignore URL ESM, resolved at runtime by the browser
      import(/* @vite-ignore */ 'https://esm.sh/html2canvas@1.4.1') as Promise<{ default: H2C }>,
      // @ts-ignore URL ESM, resolved at runtime by the browser
      import(/* @vite-ignore */ 'https://esm.sh/jspdf@2.5.1?deps=fflate@0.8.2') as Promise<{ jsPDF: JSPdf }>,
    ]);
    return { html2canvas: h2cMod.default, jsPDF: jm.jsPDF };
  })();
  return loadPromise;
}

const MARGIN_MM = 10;

function safePdfName(name: string): string {
  const trimmed = name.trim() || 'sheet-music';
  const withoutExt = trimmed.replace(/\.(pdf|xml|musicxml|mxl|mid|midi)$/i, '');
  const base =
    withoutExt
      .replace(/[/\\?%*:|"<>]/g, '-')
      .replace(/\s+/g, ' ')
      .trim() || 'sheet-music';
  return `${base}.pdf`;
}

function unclipExportClone(_doc: Document, cloned: HTMLElement) {
  const root = cloned;
  root.style.setProperty('overflow', 'visible', 'important');
  root.style.setProperty('max-width', 'none', 'important');
  root.style.setProperty('height', 'auto', 'important');
  root.style.setProperty('min-height', '0', 'important');
  for (const sel of ['.osmd-outer', '.osmd-wrap', '.osmd-mount', '.osmd-pitch-label-layer']) {
    const el = root.querySelector<HTMLElement>(sel);
    if (!el) continue;
    el.style.setProperty('overflow', 'visible', 'important');
    if (el.classList.contains('osmd-wrap') || el.classList.contains('osmd-mount')) {
      el.style.setProperty('min-height', '0', 'important');
      el.style.setProperty('height', 'auto', 'important');
    }
    if (el.classList.contains('osmd-outer')) {
      el.style.setProperty('box-shadow', 'none', 'important');
    }
  }
  for (const svg of root.querySelectorAll('svg')) {
    const s = (svg as SVGElement).style;
    s.setProperty('overflow', 'visible', 'important');
    s.setProperty('max-width', 'none', 'important');
  }
}

function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  });
}

async function elementToScoreCanvas(element: HTMLElement): Promise<HTMLCanvasElement> {
  const { html2canvas } = await loadExportLibs();
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // ignore
    }
  }
  await waitForPaint();

  return html2canvas(element, {
    backgroundColor: '#ffffff',
    scale: 2,
    useCORS: true,
    logging: false,
    onclone: (doc: Document, el: Element) => {
      if (el instanceof HTMLElement) {
        unclipExportClone(doc, el);
      }
    },
  });
}

/**
 * Find safe vertical cut positions (in canvas pixels) between music systems.
 *
 * Works for any score type (single-staff, grand staff, orchestra):
 * - Collects the {top, bottom} of every vf-stave SVG element.
 * - Sorts by top edge and deduplicates near-overlapping rects.
 * - Computes each inter-stave gap and uses the median to distinguish
 *   intra-system gaps (small, e.g. treble↔bass) from inter-system gaps
 *   (large, the whitespace between rows of measures).
 * - Cuts in the middle of each inter-system gap.
 *
 * Falls back to an empty array when no stave elements are found, in which
 * case the caller uses a blind pixel cut.
 */
function findSystemCutPoints(element: HTMLElement, canvasScale: number): number[] {
  const elementTop = element.getBoundingClientRect().top;

  const staveEls = element.querySelectorAll<SVGElement>('[class*="vf-stave"]');
  if (staveEls.length === 0) return [];

  // Collect {top, bottom} relative to the export element.
  const rects: { top: number; bottom: number }[] = [];
  staveEls.forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.height > 0) {
      rects.push({ top: r.top - elementTop, bottom: r.bottom - elementTop });
    }
  });
  if (rects.length === 0) return [];

  // Sort by top edge, then deduplicate staves whose tops are within 3 px
  // (OSMD can emit multiple SVG groups for the same stave).
  rects.sort((a, b) => a.top - b.top);
  const DEDUP_PX = 3;
  const deduped = [rects[0]];
  for (let i = 1; i < rects.length; i++) {
    if (rects[i].top - deduped[deduped.length - 1].top > DEDUP_PX) {
      deduped.push(rects[i]);
    }
  }
  if (deduped.length < 2) return [];

  // Compute the gap between consecutive stave bottom → next stave top.
  // Negative values (overlapping) are clamped to 0.
  const gaps: number[] = [];
  for (let i = 0; i < deduped.length - 1; i++) {
    gaps.push(Math.max(0, deduped[i + 1].top - deduped[i].bottom));
  }

  const positiveGaps = gaps.filter((g) => g > 0);
  if (positiveGaps.length === 0) return [];

  const sorted = [...positiveGaps].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const maxGap = sorted[sorted.length - 1];

  // When all gaps are similar (single-staff score, every gap is between systems),
  // treat every gap as a valid cut point (threshold = 0).
  // When there is high variance (grand staff / orchestra), only the large gaps
  // — more than 2× the median — are inter-system gaps.
  const threshold = maxGap / median > 2 ? median * 2 : 0;

  const cutPoints: number[] = [];
  for (let i = 0; i < gaps.length; i++) {
    if (gaps[i] > threshold) {
      const gapTop = deduped[i].bottom;
      const gapBottom = deduped[i + 1].top;
      const midCssPx = (gapTop + gapBottom) / 2;
      cutPoints.push(midCssPx * canvasScale);
    }
  }

  return cutPoints;
}

/**
 * Given the sorted cut-point array and a page boundary in canvas pixels,
 * return the best cut Y: the largest cut point that is ≤ pageBoundary and
 * is past the minimum threshold (to avoid zero-height first pages).
 * Returns null when no suitable snap point exists (caller falls back to pageBoundary).
 */
function snapToCutPoint(
  cutPoints: number[],
  pageBoundaryPx: number,
  minYPx: number
): number | null {
  let best: number | null = null;
  for (const cp of cutPoints) {
    if (cp > minYPx && cp <= pageBoundaryPx) {
      best = cp;
    }
  }
  return best;
}

/**
 * Rasterize DOM to a multi-page A4 PDF.
 * Page breaks snap to inter-system gaps so no stave is split across pages.
 */
export async function exportElementToPdf(
  element: HTMLElement,
  fileName: string
): Promise<void> {
  // Collect system cut points from the live DOM before rasterizing.
  const HTML2CANVAS_SCALE = 2;
  const cutPoints = findSystemCutPoints(element, HTML2CANVAS_SCALE);

  const canvas = await elementToScoreCanvas(element);
  const { jsPDF } = await loadExportLibs();

  const imgW = canvas.width;
  const imgH = canvas.height;
  if (imgW < 1 || imgH < 1) {
    throw new Error('Empty capture — try again when the score has finished loading.');
  }
  const outName = safePdfName(fileName);

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const contentW = pageW - 2 * MARGIN_MM;
  const contentH = pageH - 2 * MARGIN_MM;
  const mmPerPixel = contentW / imgW;
  const hMmTotal = (imgH * contentW) / imgW;

  if (hMmTotal <= contentH) {
    pdf.addImage(
      canvas.toDataURL('image/png'),
      'PNG',
      MARGIN_MM,
      MARGIN_MM,
      contentW,
      hMmTotal
    );
    pdf.save(outName);
    return;
  }

  const pxPerPage = contentH / mmPerPixel;
  let yPx = 0;

  for (let p = 0; ; p++) {
    if (p > 0) {
      pdf.addPage();
    }

    const blindCutY = yPx + pxPerPage;
    // Snap to the nearest inter-system gap that fits within this page.
    // Require at least 20% of a page height to avoid near-empty slices.
    const snapped = cutPoints.length > 0
      ? snapToCutPoint(cutPoints, blindCutY, yPx + pxPerPage * 0.2)
      : null;
    const cutY = Math.min(snapped ?? blindCutY, imgH);

    const hPx = cutY - yPx;
    if (hPx <= 0) {
      break;
    }

    const sub = document.createElement('canvas');
    sub.width = imgW;
    sub.height = hPx;
    const ctx = sub.getContext('2d');
    if (!ctx) {
      break;
    }
    ctx.drawImage(canvas, 0, yPx, imgW, hPx, 0, 0, imgW, hPx);

    const hMm = hPx * mmPerPixel;
    pdf.addImage(
      sub.toDataURL('image/png'),
      'PNG',
      MARGIN_MM,
      MARGIN_MM,
      contentW,
      hMm
    );
    yPx = cutY;

    if (yPx >= imgH) break;
  }

  pdf.save(outName);
}
