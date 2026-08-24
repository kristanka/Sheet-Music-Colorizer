/**
 * Vector PDF export.
 *
 * Renders the score into an offscreen container with OSMD's native A4 page
 * layout (`pageFormat: 'A4_P'`) — real page breaks at the notation layer, no
 * pixel-scanning heuristics, independent of the on-screen viewport width.
 * The same decoration passes as the on-screen view are applied (note colors,
 * contrast dimming, in-SVG pitch labels), then each page SVG is written to a
 * PDF page with jsPDF + svg2pdf.js: crisp vector output, no rasterizing.
 */
import { OpenSheetMusicDisplay as OSMD, PageFormat } from 'opensheetmusicdisplay';
import type { DisplaySettings } from '../types/music';
import {
  addPitchLabels,
  applyNotationContrast,
  applySourceNoteColors,
} from './osmdDecorations';

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

/**
 * Engraving scale. OSMD lays out in "staff space" units (1 unit = 10 px), and its
 * stock A4_P format is 210×297 units — which makes staves ~60% of printed sheet
 * music size (cramped systems, colliding labels). Laying out on a 140×198-unit
 * page (same A4 aspect ratio) and printing it at 210×297 mm gives ≈1.5 mm staff
 * spaces — close to printed piano music.
 */
const LAYOUT_PAGE_WIDTH_UNITS = 140;
const LAYOUT_PAGE_HEIGHT_UNITS = 198;

/** Extra vertical space between systems so above/below pitch labels never collide (OSMD default: 5). */
const SYSTEM_DISTANCE_WITH_LABELS = 8;

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

type SvgBackendLike = { getSvgElement?: () => SVGElement };

export async function exportScoreToPdf(
  musicXml: string | Blob,
  settings: DisplaySettings,
  fileName: string
): Promise<void> {
  // Lazy-load the PDF libs so they stay out of the main bundle.
  // Importing 'svg2pdf.js' registers the `svg()` method on jsPDF.
  const [{ jsPDF }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);

  const container = document.createElement('div');
  // Offscreen but rendered: label placement uses getBBox(), which returns
  // zeros under display:none. visibility:hidden keeps geometry intact.
  container.style.cssText =
    `position:absolute;left:-100000px;top:0;width:${LAYOUT_PAGE_WIDTH_UNITS * 10}px;` +
    'visibility:hidden;pointer-events:none;';
  document.body.appendChild(container);

  try {
    const osmd = new OSMD(container, {
      // No autoResize: this instance is throwaway and must not register window listeners.
      autoResize: false,
      backend: 'svg',
      drawTitle: true,
      drawSubtitle: true,
      drawComposer: true,
      drawCredits: true,
      drawPartNames: false,
      drawMeasureNumbers: true,
      pageBackgroundColor: '#FFFFFF',
    });
    osmd.EngravingRules.PageFormat = new PageFormat(
      LAYOUT_PAGE_WIDTH_UNITS,
      LAYOUT_PAGE_HEIGHT_UNITS,
      'A4_P_print_scale'
    );
    osmd.EngravingRules.MinSkyBottomDistBetweenSystems = SYSTEM_DISTANCE_WITH_LABELS;

    await osmd.load(musicXml);
    applySourceNoteColors(osmd, settings);
    await osmd.render();
    applyNotationContrast(
      container,
      osmd,
      settings.nonNoteOpacity,
      settings.showColoredNotes ? settings.pitchColors : undefined
    );
    if (settings.showColorLabels) addPitchLabels(osmd, settings);

    // Layout happened in scaled units; the PDF page is always physical A4.
    const pageWidthMm = A4_WIDTH_MM;
    const pageHeightMm = A4_HEIGHT_MM;
    const orientation = 'p' as const;

    const svgPages: SVGElement[] = [];
    for (const backend of osmd.Drawer.Backends) {
      const el = (backend as unknown as SvgBackendLike).getSvgElement?.();
      if (el) svgPages.push(el);
    }
    if (svgPages.length === 0) {
      throw new Error('Nothing to export — the score did not render.');
    }

    const pdf = new jsPDF({
      orientation,
      unit: 'mm',
      format: [pageWidthMm, pageHeightMm],
    });
    for (let i = 0; i < svgPages.length; i++) {
      if (i > 0) pdf.addPage([pageWidthMm, pageHeightMm], orientation);
      await pdf.svg(svgPages[i]!, {
        x: 0,
        y: 0,
        width: pageWidthMm,
        height: pageHeightMm,
      });
    }
    pdf.save(safePdfName(fileName));
  } finally {
    container.remove();
  }
}
