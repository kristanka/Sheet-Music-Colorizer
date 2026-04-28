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
 * Rasterize DOM to a multi-page A4 PDF.
 */
export async function exportElementToPdf(
  element: HTMLElement,
  fileName: string
): Promise<void> {
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
    const hPx = Math.min(pxPerPage, imgH - yPx);
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
    ctx.drawImage(
      canvas,
      0,
      yPx,
      imgW,
      hPx,
      0,
      0,
      imgW,
      hPx
    );
    const hMm = hPx * mmPerPixel;
    pdf.addImage(
      sub.toDataURL('image/png'),
      'PNG',
      MARGIN_MM,
      MARGIN_MM,
      contentW,
      hMm
    );
    yPx += hPx;
  }

  pdf.save(outName);
}
