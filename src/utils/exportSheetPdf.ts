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
 * Find safe vertical cut positions (in canvas pixels) by scanning the
 * rasterized canvas for rows that are white across their *entire* width,
 * including a dense scan of the leftmost strip where the brace/barline lives.
 *
 * Grand-staff systems (piano, choir…) have a brace `{` or bracket `[` that
 * runs continuously from the top of the first stave to the bottom of the last,
 * including the intra-system whitespace between staves. This makes the left
 * strip non-white inside a system, even in the gap between treble and bass.
 * Inter-system regions have no brace, so they are white everywhere.
 *
 * Additional protection: colored noteheads that extend below (or above) the
 * stave lines are detected as non-white and also prevent incorrect cuts.
 */
function findWhitespaceCutPoints(canvas: HTMLCanvasElement): number[] {
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;

  // Sparse full-width scan — checks overall whiteness of each row.
  const STEP_X = 8;
  // Dense left-strip scan — catches the brace / system barline (typically
  // within the first 200 canvas-px of the score content area).
  const LEFT_DENSE_PX = Math.min(200, width);
  const WHITE_MIN = 240;        // R, G, B must all be >= this
  const FULL_WHITE_RATIO = 0.97; // fraction of sparse samples that must be white
  const MIN_BAND_PX = 12;        // minimum band height to be treated as a gap

  const samplesPerRow = Math.max(1, Math.floor(width / STEP_X));
  const isWhite = new Uint8Array(height);

  for (let y = 0; y < height; y++) {
    const rowOff = y * width;

    // 1. Sparse full-width check.
    let whiteCount = 0;
    for (let xi = 0; xi < samplesPerRow; xi++) {
      const b = (rowOff + xi * STEP_X) * 4;
      if (
        data[b + 3] < 10 ||
        (data[b] >= WHITE_MIN && data[b + 1] >= WHITE_MIN && data[b + 2] >= WHITE_MIN)
      ) {
        whiteCount++;
      }
    }
    if (whiteCount / samplesPerRow < FULL_WHITE_RATIO) continue; // non-white row

    // 2. Dense left-strip check — any non-white pixel disqualifies the row.
    let leftAllWhite = true;
    for (let x = 0; x < LEFT_DENSE_PX; x++) {
      const b = (rowOff + x) * 4;
      if (
        data[b + 3] >= 10 &&
        (data[b] < WHITE_MIN || data[b + 1] < WHITE_MIN || data[b + 2] < WHITE_MIN)
      ) {
        leftAllWhite = false;
        break;
      }
    }
    if (!leftAllWhite) continue; // brace / barline present — inside a system

    isWhite[y] = 1;
  }

  const cutPoints: number[] = [];
  let bandStart = -1;

  for (let y = 0; y <= height; y++) {
    const white = y < height ? isWhite[y] : 0;
    if (white && bandStart === -1) {
      bandStart = y;
    } else if (!white && bandStart !== -1) {
      const bandEnd = y - 1;
      if (bandEnd - bandStart >= MIN_BAND_PX) {
        cutPoints.push((bandStart + bandEnd) / 2);
      }
      bandStart = -1;
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
 * Page breaks snap to whitespace bands between systems so no notation is split.
 */
export async function exportElementToPdf(
  element: HTMLElement,
  fileName: string
): Promise<void> {
  const canvas = await elementToScoreCanvas(element);

  // Derive cut points from the rasterized canvas so ledger lines, dynamics,
  // and other content that overflows the stave bounding box are accounted for.
  const cutPoints = findWhitespaceCutPoints(canvas);
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
