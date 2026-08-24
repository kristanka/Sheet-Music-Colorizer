/**
 * Shared post-render decoration passes over OSMD's SVG output, used by both the
 * on-screen view (MusicDisplay) and the vector PDF exporter (exportSheetPdf):
 *
 *  - applySourceNoteColors: per-note NoteheadColor from the pitch palette
 *  - applyNotationContrast: dim non-note elements, outline note heads
 *  - addPitchLabels / removePitchLabels: pitch-letter <text> labels appended
 *    INSIDE the SVG so they scale with the score, print correctly, and survive
 *    vector PDF export (unlike the old absolutely-positioned DOM overlays).
 *
 * Label placement is per staff (settled design): top staff of a multi-staff
 * instrument (and treble-clef single staves) get labels above the staff;
 * bass-clef / lower staves get them below. Chords place labels beside each head.
 */
import { OpenSheetMusicDisplay as OSMD, ColoringModes } from 'opensheetmusicdisplay';
import type {
  GraphicalMeasure,
  GraphicalVoiceEntry,
  Note,
  VexFlowGraphicalNote,
} from 'opensheetmusicdisplay';
import type { DisplaySettings, PitchClass, PitchColors } from '../types/music';
import type { DrumKey } from '../types/drums';
import { DRUM_KIT, drumColor } from '../types/drums';
import { getHalfTone } from './chordRecognition';
import { drumKeyFromOsmdNote } from './drumDetect';
import { getPitchColor } from './pitchColors';
import { fundamentalNoteToPitchClass } from './osmdPitch';

const SVG_NS = 'http://www.w3.org/2000/svg';

export const LABEL_LAYER_CLASS = 'smc-pitch-labels';
const LABEL_CLASS = 'smc-pitch-label';
/** SVG user units ≈ px at zoom 1. */
const LABEL_FONT_SIZE = 12;
/** Gap between staff/notehead edge and the label. */
const LABEL_GAP = 4;
/** Chord labels sit to the left of each head. */
const CHORD_LABEL_BESIDE_GAP = 3;

// ---------------------------------------------------------------------------
// Pitch helpers
// ---------------------------------------------------------------------------

function pitchClassFromSourceNote(sourceNote: Note | undefined): PitchClass | null {
  if (!sourceNote?.Pitch) return null;
  if (sourceNote.isRest?.()) return null;
  return fundamentalNoteToPitchClass(sourceNote.Pitch.FundamentalNote as number);
}

function isVexGraphicalNote(n: unknown): n is VexFlowGraphicalNote {
  return (
    n !== null &&
    typeof n === 'object' &&
    'getNoteheadSVGs' in n &&
    typeof (n as VexFlowGraphicalNote).getNoteheadSVGs === 'function'
  );
}

function pitchedSourceNotes(voiceEntry: { Notes: Note[] } | undefined | null): Note[] {
  if (!voiceEntry?.Notes) return [];
  return voiceEntry.Notes.filter((n) => n != null && !n.isRest?.() && n.Pitch != null);
}

/**
 * Label text + color for a note: drum abbreviation (K, S, HH…) for unpitched
 * drum notes, pitch letter for pitched notes. Drums are checked first — OSMD
 * may synthesize a Pitch for unpitched notes from their display position, so
 * the pitch path alone would mislabel drum charts.
 */
function labelInfoFromSourceNote(
  sourceNote: Note | undefined,
  settings: DisplaySettings
): { text: string; color: string } | null {
  if (!sourceNote || sourceNote.isRest?.()) return null;
  const dk = drumKeyFromOsmdNote(sourceNote);
  if (dk) {
    return { text: DRUM_KIT[dk].abbrev, color: drumColor(dk, settings.drumColors) };
  }
  const p = pitchClassFromSourceNote(sourceNote);
  if (!p) return null;
  return { text: p, color: getPitchColor(p, settings.pitchColors) };
}

function isDrumVoiceEntry(voiceEntry: GraphicalVoiceEntry): boolean {
  const notes = voiceEntry.parentVoiceEntry?.Notes ?? [];
  return notes.some((n) => drumKeyFromOsmdNote(n) != null);
}

/** Vertical staff order of a kit piece (bigger = higher on the staff). */
function drumStaffOrder(key: DrumKey): number {
  const p = DRUM_KIT[key];
  const stepIdx = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 }[p.displayStep];
  return p.displayOctave * 7 + stepIdx;
}

/**
 * Drum labels: one small column ABOVE the staff at the hit's x position,
 * ordered like the staff itself (lowest piece nearest the staff), deduplicated.
 * Per-head "beside" labels don't work for drums — OSMD reports every chord
 * head for each note, which doubles labels and smears them across neighbors.
 */
function appendDrumLabels(
  voiceEntry: GraphicalVoiceEntry,
  headEls: Element[],
  staffBounds: { top: number; bottom: number } | null,
  settings: DisplaySettings
): boolean {
  const keys = (voiceEntry.parentVoiceEntry?.Notes ?? [])
    .map((n) => drumKeyFromOsmdNote(n))
    .filter((k): k is DrumKey => k != null);
  if (keys.length === 0 || headEls.length === 0) return false;

  const boxes = headEls
    .map((el) => bboxOf(el))
    .filter((b): b is NonNullable<ReturnType<typeof bboxOf>> => b != null);
  if (boxes.length === 0) return false;
  const svg = (headEls[0] as SVGGraphicsElement).ownerSVGElement;
  if (!svg) return false;

  const minX = Math.min(...boxes.map((b) => b.x));
  const maxX = Math.max(...boxes.map((b) => b.x + b.width));
  const topY = Math.min(...boxes.map((b) => b.y));
  const cx = (minX + maxX) / 2;
  const topRef = staffBounds ? Math.min(staffBounds.top, topY) : topY;

  const uniqueKeys = Array.from(new Set(keys)).sort(
    (a, b) => drumStaffOrder(a) - drumStaffOrder(b)
  );
  uniqueKeys.forEach((k, i) => {
    appendSvgLabel(
      svg,
      cx,
      topRef - LABEL_GAP - i * LABEL_FONT_SIZE,
      DRUM_KIT[k].abbrev,
      drumColor(k, settings.drumColors),
      'middle'
    );
  });
  return true;
}

// ---------------------------------------------------------------------------
// Source-note coloring
// ---------------------------------------------------------------------------

/**
 * Sets OSMD coloring options and per-note `NoteheadColor` from the current
 * settings. Call after `load()` (or before a re-`render()`); does not render.
 *
 * Coloring stays ALWAYS enabled: OSMD reuses its internal VexFlow note objects
 * across renders and only runs its coloring pass when ColoringEnabled is true —
 * disabling it would skip the pass and leave stale colors baked into the reused
 * notes. Turning colors "off" therefore paints every head black explicitly.
 */
export function applySourceNoteColors(osmd: OSMD, settings: DisplaySettings): void {
  osmd.setOptions({
    /** XML (0): use our NoteheadColor. Mode 1 is Boomwhacker and overrides notehead colors, so label vs note mismatch. */
    coloringEnabled: true,
    coloringMode: ColoringModes.XML,
  });
  osmd.GraphicSheet?.MeasureList?.forEach((ml) => {
    ml?.forEach((sm) => {
      sm?.staffEntries?.forEach((se) => {
        se.graphicalVoiceEntries?.forEach((ve) => {
          ve.notes?.forEach((gn) => {
            const info = labelInfoFromSourceNote(gn.sourceNote, settings);
            if (info && gn.sourceNote) {
              gn.sourceNote.NoteheadColor = settings.showColoredNotes
                ? info.color
                : '#000000';
            }
          });
        });
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Notation contrast (dimming) pass
// ---------------------------------------------------------------------------

/** Normalize #RGB / #RRGGBB hex for comparison (no leading #). */
function normalizeSvgHex(cssColor: string): string | null {
  let t = cssColor.trim().toLowerCase().replace(/^#/, '');
  if (t.length === 3) {
    t = t
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (/^[0-9a-f]{6}$/.test(t)) return t;
  if (/^[0-9a-f]{8}$/.test(t)) return t.slice(0, 6);
  return null;
}

/** True when fill or stroke is exactly one of the pitch palette colors (colored heads). */
function fillOrStrokeUsesPitchPalette(
  fill: string | null,
  stroke: string | null,
  palette: PitchColors
): boolean {
  const paletteHexes = new Set(
    Object.values(palette).map(normalizeSvgHex).filter((x): x is string => x != null)
  );
  for (const attr of [fill, stroke]) {
    if (!attr || attr === 'none') continue;
    const nh = normalizeSvgHex(attr);
    if (nh && paletteHexes.has(nh)) return true;
  }
  return false;
}

/** Vex/OSMD may return a wrapping <g> with the actual glyph paths nested one level deep. */
function registerNoteGlyphElements(rootFromApi: Element, into: Set<Element>): void {
  into.add(rootFromApi);
  if (rootFromApi.tagName.toLowerCase() !== 'g') return;
  for (const child of Array.from(rootFromApi.children)) {
    const ct = child.tagName.toLowerCase();
    if (['path', 'ellipse', 'circle', 'rect', 'polygon', 'use'].includes(ct)) {
      into.add(child);
    }
  }
}

/** All rendered notehead SVG elements in the score (glyph paths promoted from wrapping groups when needed). */
function collectAllNoteheadElements(osmd: OSMD): Set<Element> {
  const set = new Set<Element>();
  osmd.GraphicSheet?.MeasureList?.forEach((measureList) => {
    measureList?.forEach((staffMeasure) => {
      staffMeasure?.staffEntries?.forEach((staffEntry) => {
        staffEntry.graphicalVoiceEntries?.forEach((voiceEntry) => {
          for (const gNote of voiceEntry.notes ?? []) {
            if (!isVexGraphicalNote(gNote)) continue;
            const raw = gNote.getNoteheadSVGs() as unknown;
            const heads = (Array.isArray(raw) ? raw : []).filter(
              (h): h is Element =>
                h != null && typeof (h as Element).getBoundingClientRect === 'function'
            );
            for (const el of heads) registerNoteGlyphElements(el, set);
          }
        });
      });
    });
  });
  return set;
}

const SVG_SHAPE_SELECTOR =
  'path, line, polyline, polygon, rect, circle, ellipse, text, tspan, use';

/**
 * VexFlow group class names (prefixed with `vf-` by SVGContext.openGroup) that must never be dimmed.
 * - vf-stavenote     → note body: head + stem + flags + accidentals
 * - vf-ledgers       → ledger lines (drawn outside vf-stavenote in VexFlow 1.x / OSMD 1.9.x)
 * - vf-clef          → clef glyph
 * - vf-timesignature → time signature (4/4, 3/4, …)
 * - vf-keysignature  → key signature (sharps / flats)
 * - vf-beam          → beam connecting notes
 * Our own pitch-label layer is also excluded (it manages its own colors).
 */
const KEEP_BRIGHT_GROUP_SELECTOR =
  '[class*="vf-stavenote"], [class*="vf-ledgers"], [class*="vf-clef"], ' +
  '[class*="vf-timesignature"], [class*="vf-keysignature"], [class*="vf-beam"], ' +
  `.${LABEL_LAYER_CLASS}`;

function insideKeepBrightGroup(el: Element): boolean {
  return el.closest(KEEP_BRIGHT_GROUP_SELECTOR) != null;
}

/**
 * OSMD renders credits (title, subtitle, composer…) via SvgVexFlowBackend.renderText() which calls
 * VexFlow SVGContext.openGroup("text") → class `vf-text`. These groups appear in the SVG *before*
 * the first stave, so we collect any vf-text group whose document-order index is smaller than the
 * first `vf-stave` / `vf-stavenote` group.
 */
function collectHeaderCreditsTextGroups(svg: SVGSVGElement): Set<Element> {
  const firstStaff = svg.querySelector('[class*="vf-stave"], [class*="vf-stavenote"]');
  if (!firstStaff) return new Set();
  const out = new Set<Element>();
  for (const g of svg.querySelectorAll('g')) {
    const cls = g.getAttribute('class') ?? '';
    if (!cls.includes('vf-text')) continue;
    // compareDocumentPosition: FOLLOWING = 4 means firstStaff follows g, so g comes first.
    if (firstStaff.compareDocumentPosition(g) & Node.DOCUMENT_POSITION_FOLLOWING) out.add(g);
  }
  return out;
}

/** 1px black stroke around a notehead shape for contrast (not applied to text/tspan). */
function applyNoteheadOutline(el: SVGElement): void {
  const tag = el.tagName.toLowerCase();
  if (tag === 'text' || tag === 'tspan') return;
  el.setAttribute('stroke', '#000000');
  el.setAttribute('stroke-width', '1');
  el.setAttribute('vector-effect', 'non-scaling-stroke');
  el.setAttribute('stroke-linejoin', 'round');
  el.setAttribute('stroke-linecap', 'round');
  el.style.setProperty('paint-order', 'fill stroke');
}

/**
 * Dims staff lines, bar lines, ties, slurs, and other structural elements to `nonNoteOpacity`.
 * Keeps full opacity on note-structural groups, header credits, and our label layer.
 * Applies a 1 px black outline to notehead shapes for contrast.
 * Handles multi-page renders (one <svg> per OSMD page).
 */
export function applyNotationContrast(
  root: HTMLElement,
  osmd: OSMD,
  nonNoteOpacity: number,
  coloredHeadPalette?: PitchColors | undefined
): void {
  if (!osmd.GraphicSheet) return;
  const svgs = root.querySelectorAll('svg');
  if (svgs.length === 0) return;

  const noteheads = collectAllNoteheadElements(osmd);
  const dim = String(nonNoteOpacity);

  for (const svg of svgs) {
    const headerCreditsRoots = collectHeaderCreditsTextGroups(svg);

    for (const el of svg.querySelectorAll(SVG_SHAPE_SELECTOR)) {
      if (!(el instanceof SVGElement)) continue;
      if (el.closest('defs')) continue;

      // Header credits: title, subtitle, composer (vf-text groups before first stave).
      let inCredits = false;
      for (const r of headerCreditsRoots) {
        if (r.contains(el)) {
          inCredits = true;
          break;
        }
      }
      if (inCredits) {
        el.removeAttribute('opacity');
        el.style.removeProperty('opacity');
        continue;
      }

      // Note-structural groups + label layer: keep bright; notehead shapes also get a black outline.
      if (insideKeepBrightGroup(el)) {
        el.removeAttribute('opacity');
        el.style.removeProperty('opacity');
        if (noteheads.has(el)) {
          applyNoteheadOutline(el);
        } else if (
          coloredHeadPalette &&
          el.closest('[class*="vf-stavenote"]') != null &&
          fillOrStrokeUsesPitchPalette(
            el.getAttribute('fill'),
            el.getAttribute('stroke'),
            coloredHeadPalette
          )
        ) {
          // OSMD paints accidental glyphs (♯/♭/♮) with the note's color, which
          // makes them unreadable next to colored heads and labels. Anything
          // palette-colored inside a stavenote that is NOT a registered
          // notehead gets reset to black.
          const fill = el.getAttribute('fill');
          if (fill && fill !== 'none') el.setAttribute('fill', '#000000');
          const stroke = el.getAttribute('stroke');
          if (stroke && stroke !== 'none') el.setAttribute('stroke', '#000000');
        }
        continue;
      }

      // Everything else (staff lines, barlines, ties, slurs, dynamics, …) gets dimmed.
      el.setAttribute('opacity', dim);
    }
  }
}

// ---------------------------------------------------------------------------
// In-SVG pitch labels
// ---------------------------------------------------------------------------

/** Minimal structural view of a VexFlow Stave (avoids depending on VexFlow typings). */
type VfStaveLike = {
  getYForLine?: (line: number) => number;
  clef?: string;
};

function getVfStave(measure: GraphicalMeasure): VfStaveLike | null {
  const m = measure as unknown as { getVFStave?: () => VfStaveLike };
  if (typeof m.getVFStave !== 'function') return null;
  try {
    return m.getVFStave() ?? null;
  } catch {
    return null;
  }
}

/**
 * Per-staff placement rule: top staff of a multi-staff instrument → above;
 * lower staves → below; single bass-clef staff → below; everything else → above.
 */
function placeLabelsAboveForStaff(measure: GraphicalMeasure): boolean {
  const staff = measure.ParentStaff as unknown as
    | { ParentInstrument?: { Staves?: unknown[] } }
    | undefined;
  const staves = staff?.ParentInstrument?.Staves;
  if (staves && staves.length > 1) {
    return staves.indexOf(staff as unknown) === 0;
  }
  if (getVfStave(measure)?.clef === 'bass') return false;
  return true;
}

/** Top/bottom staff-line Y in SVG user units, when VexFlow exposes them. */
function staffYBounds(measure: GraphicalMeasure): { top: number; bottom: number } | null {
  const stave = getVfStave(measure);
  if (!stave || typeof stave.getYForLine !== 'function') return null;
  try {
    const top = stave.getYForLine(0);
    const bottom = stave.getYForLine(4);
    if (Number.isFinite(top) && Number.isFinite(bottom)) return { top, bottom };
  } catch {
    /* fall through */
  }
  return null;
}

/** getBBox() in SVG user units — same space VexFlow draws in (no transforms on note glyphs). */
function bboxOf(el: Element): { x: number; y: number; width: number; height: number } | null {
  const g = el as SVGGraphicsElement;
  if (typeof g.getBBox !== 'function') return null;
  try {
    const b = g.getBBox();
    if (b.width === 0 && b.height === 0) return null;
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  } catch {
    return null;
  }
}

function ensureLabelLayer(svg: SVGSVGElement): SVGGElement {
  for (const child of Array.from(svg.children)) {
    if (child instanceof SVGGElement && child.classList.contains(LABEL_LAYER_CLASS)) {
      return child;
    }
  }
  const layer = document.createElementNS(SVG_NS, 'g');
  layer.setAttribute('class', LABEL_LAYER_CLASS);
  layer.setAttribute('aria-hidden', 'true');
  svg.appendChild(layer);
  return layer;
}

/**
 * A plain colored <text> label. Deliberately no white halo/background: over
 * dense chords a halo erases the noteheads and stems underneath it (and
 * svg2pdf renders stroked text as a solid white block). Staff lines are
 * dimmed by the contrast pass, so bare colored letters stay readable.
 */
function appendSvgLabel(
  svg: SVGSVGElement,
  x: number,
  y: number,
  text: string,
  color: string,
  anchor: 'middle' | 'end'
): void {
  const layer = ensureLabelLayer(svg);
  const t = document.createElementNS(SVG_NS, 'text');
  t.setAttribute('x', String(x));
  t.setAttribute('y', String(y));
  t.setAttribute('text-anchor', anchor);
  t.setAttribute('font-size', String(LABEL_FONT_SIZE));
  t.setAttribute('font-weight', '600');
  t.setAttribute('font-family', 'Helvetica, Arial, sans-serif');
  t.setAttribute('fill', color);
  t.setAttribute('class', LABEL_CLASS);
  t.textContent = text;
  layer.appendChild(t);
}

function appendLabelForHead(
  headEl: Element,
  head: { x: number; y: number; width: number; height: number },
  staffBounds: { top: number; bottom: number } | null,
  placeAbove: boolean,
  stackedBeside: boolean,
  text: string,
  color: string
): void {
  const svg = (headEl as SVGGraphicsElement).ownerSVGElement;
  if (!svg) return;
  if (stackedBeside) {
    // Chord: label to the left of the WHOLE stavenote (accidentals included —
    // anchoring to the notehead would print labels on top of sharps/flats),
    // vertically centered on its head.
    const group = headEl.closest('[class*="vf-stavenote"]');
    const groupBox = group ? bboxOf(group) : null;
    const anchorX = (groupBox ? groupBox.x : head.x) - CHORD_LABEL_BESIDE_GAP;
    appendSvgLabel(
      svg,
      anchorX,
      head.y + head.height / 2 + LABEL_FONT_SIZE * 0.35,
      text,
      color,
      'end'
    );
    return;
  }
  const cx = head.x + head.width / 2;
  if (placeAbove) {
    // Above the staff — or above the notehead when it pokes out on ledger lines.
    const topRef = staffBounds ? Math.min(staffBounds.top, head.y) : head.y;
    appendSvgLabel(svg, cx, topRef - LABEL_GAP, text, color, 'middle');
  } else {
    const bottomRef = staffBounds
      ? Math.max(staffBounds.bottom, head.y + head.height)
      : head.y + head.height;
    appendSvgLabel(svg, cx, bottomRef + LABEL_GAP + LABEL_FONT_SIZE * 0.8, text, color, 'middle');
  }
}

/** Deduped notehead elements across a chord (Vex can expose one GNote with many heads, or one per pitch). */
function uniqueNoteheadElements(ve: GraphicalVoiceEntry): Element[] {
  const out: Element[] = [];
  const seen = new Set<Element>();
  for (const gNote of ve.notes ?? []) {
    if (!isVexGraphicalNote(gNote)) continue;
    const raw = gNote.getNoteheadSVGs() as unknown;
    const list = (Array.isArray(raw) ? raw : []).filter(
      (h): h is Element => h != null && typeof h.getBoundingClientRect === 'function'
    );
    for (const el of list) {
      if (!seen.has(el)) {
        seen.add(el);
        out.push(el);
      }
    }
  }
  return out;
}

/**
 * Pairs each physical notehead with the correct source note: bottom of stack → lowest pitch.
 * @returns true if a label was placed for every head (chord or single)
 */
function appendZippedLabels(
  headEls: Element[],
  sourceNotes: Note[],
  staffBounds: { top: number; bottom: number } | null,
  placeAbove: boolean,
  settings: DisplaySettings
): boolean {
  const withMidi = sourceNotes
    .map((n) => {
      const h = getHalfTone(n);
      return h != null ? { n, midi: h } : null;
    })
    .filter((x): x is { n: Note; midi: number } => x != null);
  if (withMidi.length !== headEls.length) return false;

  const headsWithBox = headEls
    .map((el) => {
      const box = bboxOf(el);
      return box ? { el, box } : null;
    })
    .filter((x): x is { el: Element; box: NonNullable<ReturnType<typeof bboxOf>> } => x != null);
  if (headsWithBox.length !== withMidi.length) return false;

  withMidi.sort((a, b) => a.midi - b.midi);
  headsWithBox.sort((a, b) => b.box.y - a.box.y); // bottom → top
  const stacked = headsWithBox.length > 1;

  for (let i = 0; i < headsWithBox.length; i++) {
    const n = withMidi[i]!.n;
    const p = pitchClassFromSourceNote(n);
    if (!p) return false;
    appendLabelForHead(
      headsWithBox[i]!.el,
      headsWithBox[i]!.box,
      staffBounds,
      placeAbove,
      stacked,
      p,
      getPitchColor(p, settings.pitchColors)
    );
  }
  return true;
}

/**
 * Appends pitch-letter labels as <text> elements inside each page's SVG.
 * Call after render (and after applyNotationContrast). Idempotent when
 * preceded by removePitchLabels().
 */
export function addPitchLabels(osmd: OSMD, settings: DisplaySettings): void {
  if (!osmd.GraphicSheet) return;
  try {
    osmd.GraphicSheet.MeasureList?.forEach((measureList) => {
      measureList?.forEach((staffMeasure) => {
        if (!staffMeasure) return;
        const placeAbove = placeLabelsAboveForStaff(staffMeasure);
        const staffBounds = staffYBounds(staffMeasure);
        staffMeasure.staffEntries?.forEach((staffEntry) => {
          staffEntry.graphicalVoiceEntries?.forEach((voiceEntry) => {
            const isDrums = isDrumVoiceEntry(voiceEntry);
            const pitched = pitchedSourceNotes(voiceEntry.parentVoiceEntry);
            const uniqueHeads = uniqueNoteheadElements(voiceEntry);

            // Drums: one deduplicated label column above the staff per hit.
            if (isDrums) {
              appendDrumLabels(voiceEntry, uniqueHeads, staffBounds, settings);
              return;
            }

            if (uniqueHeads.length > 0 && uniqueHeads.length === pitched.length) {
              if (appendZippedLabels(uniqueHeads, pitched, staffBounds, placeAbove, settings)) {
                return;
              }
            }

            // Coarser fallback: label every head (or the note group) per graphical note.
            voiceEntry.notes?.forEach((gNote) => {
              const sourceNote = gNote.sourceNote;
              const info = labelInfoFromSourceNote(sourceNote, settings);
              if (!info) return;
              if (!isVexGraphicalNote(gNote)) return;

              const { text: pitch, color } = info;
              const rawHeads = gNote.getNoteheadSVGs() as unknown;
              const heads: Element[] = (Array.isArray(rawHeads) ? rawHeads : []).filter(
                (h): h is Element =>
                  h != null && typeof (h as Element).getBoundingClientRect === 'function'
              );

              if (heads.length > 0) {
                const stacked = heads.length > 1;
                for (const headEl of heads) {
                  const box = bboxOf(headEl);
                  if (!box) continue;
                  appendLabelForHead(headEl, box, staffBounds, placeAbove, stacked, pitch, color);
                }
              } else {
                const g = gNote.getSVGGElement?.();
                if (g) {
                  const box = bboxOf(g);
                  if (box) {
                    appendLabelForHead(g, box, staffBounds, placeAbove, false, pitch, color);
                  }
                }
              }
            });
          });
        });
      });
    });
  } catch (e) {
    console.warn('Could not place pitch labels:', e);
  }
}

/** Removes all pitch-label layers under `root` (across all page SVGs). */
export function removePitchLabels(root: ParentNode): void {
  root.querySelectorAll(`.${LABEL_LAYER_CLASS}`).forEach((el) => el.remove());
}
