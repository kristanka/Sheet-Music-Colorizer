import React, { useEffect, useRef, useCallback } from 'react';
import { OpenSheetMusicDisplay as OSMD, ColoringModes } from 'opensheetmusicdisplay';
import type { GraphicalVoiceEntry, Note, VexFlowGraphicalNote } from 'opensheetmusicdisplay';
import type { DisplaySettings, PitchClass, PitchColors } from '../types/music';
import { getHalfTone } from '../utils/chordRecognition';
import { getPitchColor } from '../utils/pitchColors';
import { fundamentalNoteToPitchClass, isStrictlyAboveB4 } from '../utils/osmdPitch';

interface MusicDisplayProps {
  musicXml: string;
  settings: DisplaySettings;
}

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

function offsetInLabelRoot(
  target: Element,
  labelRoot: HTMLElement
): { left: number; top: number; width: number; height: number } {
  const t = target.getBoundingClientRect();
  const r = labelRoot.getBoundingClientRect();
  return {
    left: t.left - r.left + labelRoot.scrollLeft,
    top: t.top - r.top + labelRoot.scrollTop,
    width: t.width,
    height: t.height,
  };
}

/** Same color string as note heads: one source of truth. */
function noteAndLabelColor(
  letter: PitchClass,
  settings: DisplaySettings
): string {
  return getPitchColor(letter, settings.pitchColors);
}

/** Stacked only: text immediately to the left of the notehead, vertically aligned to the head. */
const CHORD_LABEL_BESIDE_GAP_PX = 3;

function buildPitchLabel(
  o: { left: number; top: number; width: number; height: number },
  text: string,
  color: string,
  placeAbove: boolean,
  xOffsetPx = 0,
  yNudgeUpPx = 0,
  /** Multiple pitches at one beat: place to the left of each head, not above/below staff. */
  stackedNotesBeside = false
): HTMLDivElement {
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.textContent = text;
  if (stackedNotesBeside) {
    const x = o.left - CHORD_LABEL_BESIDE_GAP_PX + xOffsetPx;
    const y = o.top + o.height / 2 - yNudgeUpPx;
    el.style.cssText = [
      'position:absolute',
      `left:${x}px`,
      `top:${y}px`,
      'transform:translate(-100%,-50%)',
      'font-size:12px',
      'font-weight:600',
      'line-height:1',
      'z-index:2',
      'pointer-events:none',
      'white-space:nowrap',
      'text-shadow:0 0 2px #fff,0 0 3px #fff,0 0 4px #fff',
      `color:${color}`,
    ].join(';');
    return el;
  }
  const x = o.left + o.width / 2 + xOffsetPx;
  if (placeAbove) {
    el.style.cssText = [
      'position:absolute',
      `left:${x}px`,
      `top:${o.top - 4 - yNudgeUpPx}px`,
      'transform:translate(-50%,-100%)',
      'font-size:12px',
      'font-weight:600',
      'line-height:1',
      'z-index:2',
      'pointer-events:none',
      'white-space:nowrap',
      'text-shadow:0 0 2px #fff,0 0 3px #fff,0 0 4px #fff',
      `color:${color}`,
    ].join(';');
  } else {
    el.style.cssText = [
      'position:absolute',
      `left:${x}px`,
      `top:${o.top + o.height + 4 - yNudgeUpPx}px`,
      'transform:translate(-50%,0)',
      'font-size:12px',
      'font-weight:600',
      'line-height:1',
      'z-index:2',
      'pointer-events:none',
      'white-space:nowrap',
      'text-shadow:0 0 2px #fff,0 0 3px #fff,0 0 4px #fff',
      `color:${color}`,
    ].join(';');
  }
  return el;
}

function pitchedSourceNotes(voiceEntry: { Notes: Note[] } | undefined | null): Note[] {
  if (!voiceEntry?.Notes) return [];
  return voiceEntry.Notes.filter(
    (n) => n != null && !n.isRest?.() && n.Pitch != null
  );
}

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
function collectAllNoteheadElements(osmd: InstanceType<typeof OSMD>): Set<Element> {
  const set = new Set<Element>();
  osmd.GraphicSheet?.MeasureList?.forEach((measureList) => {
    measureList?.forEach((staffMeasure) => {
      staffMeasure.staffEntries?.forEach((staffEntry) => {
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
 */
const KEEP_BRIGHT_GROUP_SELECTOR =
  '[class*="vf-stavenote"], [class*="vf-ledgers"], [class*="vf-clef"], ' +
  '[class*="vf-timesignature"], [class*="vf-keysignature"], [class*="vf-beam"]';

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
 * Keeps full opacity on: note heads/stems/ledger lines (vf-stavenote), clefs (vf-clef),
 * time signatures (vf-timesignature), key signatures (vf-keysignature), beams (vf-beam),
 * and header credits (title, subtitle, composer).
 * Applies a 1 px black outline to notehead shapes for contrast.
 */
function applyNotationContrast(
  mount: HTMLElement,
  osmd: InstanceType<typeof OSMD>,
  nonNoteOpacity: number,
  coloredHeadPalette?: PitchColors | undefined
): void {
  const svg = mount.querySelector('svg');
  if (!svg || !osmd.GraphicSheet) return;

  const noteheads = collectAllNoteheadElements(osmd);
  const headerCreditsRoots = collectHeaderCreditsTextGroups(svg);
  const dim = String(nonNoteOpacity);

  for (const el of svg.querySelectorAll(SVG_SHAPE_SELECTOR)) {
    if (!(el instanceof SVGElement)) continue;
    if (el.closest('defs')) continue;

    // Header credits: title, subtitle, composer (vf-text groups before first stave).
    let inCredits = false;
    for (const r of headerCreditsRoots) {
      if (r.contains(el)) { inCredits = true; break; }
    }
    if (inCredits) {
      el.removeAttribute('opacity');
      el.style.removeProperty('opacity');
      continue;
    }

    // Note-structural groups: keep bright; notehead shapes also get a black outline.
    if (insideKeepBrightGroup(el)) {
      el.removeAttribute('opacity');
      el.style.removeProperty('opacity');
      const isHead =
        noteheads.has(el) ||
        (!!coloredHeadPalette &&
          fillOrStrokeUsesPitchPalette(el.getAttribute('fill'), el.getAttribute('stroke'), coloredHeadPalette));
      if (isHead) applyNoteheadOutline(el);
      continue;
    }

    // Everything else (staff lines, barlines, ties, slurs, dynamics, …) gets dimmed.
    el.setAttribute('opacity', dim);
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
function appendPitchLabelsZipped(
  headEls: Element[],
  sourceNotes: Note[],
  labelRoot: HTMLElement,
  settings: DisplaySettings,
  overlayOut: HTMLDivElement[]
): boolean {
  const withMidi = sourceNotes
    .map((n) => {
      const h = getHalfTone(n);
      return h != null ? { n, midi: h } : null;
    })
    .filter((x): x is { n: Note; midi: number } => x != null);
  if (withMidi.length !== headEls.length) return false;
  withMidi.sort((a, b) => a.midi - b.midi);
  const headsBottomToTop = [...headEls].sort(
    (a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top
  );
  const stacked = headsBottomToTop.length > 1;
  for (let i = 0; i < headsBottomToTop.length; i++) {
    const n = withMidi[i]!.n;
    const p = pitchClassFromSourceNote(n);
    if (!n.Pitch || !p) return false;
    const o = offsetInLabelRoot(headsBottomToTop[i]!, labelRoot);
    const placeAbove = isStrictlyAboveB4(n.Pitch);
    const el = buildPitchLabel(
      o,
      p,
      noteAndLabelColor(p, settings),
      placeAbove,
      0,
      0,
      stacked
    );
    labelRoot.appendChild(el);
    overlayOut.push(el);
  }
  return true;
}

export const MusicDisplay: React.FC<MusicDisplayProps> = ({ musicXml, settings }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const osmdMountRef = useRef<HTMLDivElement>(null);
  const labelLayerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OSMD | null>(null);
  const overlaysRef = useRef<HTMLDivElement[]>([]);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Keeps contrast pass in sync with slider when OSMD redraws async (avoid stale closures). */
  const nonNoteOpacityRef = useRef(settings.nonNoteOpacity);
  nonNoteOpacityRef.current = settings.nonNoteOpacity;
  const contrastDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contrastPaletteRef = useRef<PitchColors | undefined>(undefined);
  contrastPaletteRef.current = settings.showColoredNotes ? settings.pitchColors : undefined;

  const scheduleNotationContrastApply = useCallback(() => {
    if (contrastDebounceRef.current !== null) {
      clearTimeout(contrastDebounceRef.current);
    }
    contrastDebounceRef.current = setTimeout(() => {
      contrastDebounceRef.current = null;
      const mount = osmdMountRef.current;
      const osmd = osmdRef.current;
      if (!mount || !osmd?.GraphicSheet) return;
      applyNotationContrast(mount, osmd, nonNoteOpacityRef.current, contrastPaletteRef.current);
    }, 80);
  }, []);

  const clearOverlays = useCallback(() => {
    overlaysRef.current.forEach((el) => el.remove());
    overlaysRef.current = [];
  }, []);

  const addLabelOverlays = useCallback(() => {
    const labelRoot = labelLayerRef.current;
    if (!labelRoot || !osmdRef.current?.GraphicSheet || !settings.showColorLabels) {
      return;
    }

    clearOverlays();
    const lr = labelRoot;
    const sheet = osmdRef.current.GraphicSheet;

    try {
      sheet.MeasureList?.forEach((measureList) => {
        measureList?.forEach((staffMeasure) => {
          if (!staffMeasure) return;
          staffMeasure.staffEntries?.forEach((staffEntry) => {
            staffEntry.graphicalVoiceEntries?.forEach((voiceEntry) => {
              const pve = voiceEntry.parentVoiceEntry;
              const pitched = pitchedSourceNotes(pve);
              const uniqueHeads = uniqueNoteheadElements(voiceEntry);

              if (uniqueHeads.length > 0 && uniqueHeads.length === pitched.length) {
                const ok = appendPitchLabelsZipped(
                  uniqueHeads,
                  pitched,
                  lr,
                  settings,
                  overlaysRef.current
                );
                if (ok) return;
              }

              voiceEntry.notes?.forEach((gNote) => {
                const sourceNote = gNote.sourceNote;
                const pitch = pitchClassFromSourceNote(sourceNote);
                if (!pitch) return;
                if (!isVexGraphicalNote(gNote)) return;
                if (!sourceNote?.Pitch) return;

                const placeAbove = isStrictlyAboveB4(sourceNote.Pitch);
                const color = noteAndLabelColor(pitch, settings);

                const rawHeads = gNote.getNoteheadSVGs() as unknown;
                const heads: Element[] = (Array.isArray(rawHeads) ? rawHeads : []).filter(
                  (h): h is Element =>
                    h != null && typeof (h as Element).getBoundingClientRect === 'function'
                );

                if (heads.length > 0) {
                  const mult = heads.length > 1;
                  for (let hi = 0; hi < heads.length; hi++) {
                    const o = offsetInLabelRoot(heads[hi]!, lr);
                    const el = buildPitchLabel(
                      o,
                      pitch,
                      color,
                      placeAbove,
                      0,
                      0,
                      mult
                    );
                    lr.appendChild(el);
                    overlaysRef.current.push(el);
                  }
                } else {
                  const g = gNote.getSVGGElement?.();
                  if (g) {
                    const o = offsetInLabelRoot(g, lr);
                    const el = buildPitchLabel(o, pitch, color, placeAbove);
                    lr.appendChild(el);
                    overlaysRef.current.push(el);
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
  }, [settings, clearOverlays]);

  const scheduleLabelUpdate = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      requestAnimationFrame(() => {
        addLabelOverlays();
      });
    }, 50);
  }, [addLabelOverlays]);

  useEffect(() => {
    const mount = osmdMountRef.current;
    if (!mount || !labelLayerRef.current) return;

    mount.replaceChildren();
    labelLayerRef.current.replaceChildren();
    clearOverlays();

    const osmd = new OSMD(mount, {
      autoResize: true,
      backend: 'svg',
      drawTitle: true,
      drawSubtitle: true,
      drawComposer: true,
      drawCredits: true,
      /** false: do not draw instrument names; empty MusicXML part names still left first-system name slots. */
      drawPartNames: false,
      drawMeasureNumbers: true,
      /** XML (0): use our NoteheadColor. Mode 1 is Boomwhacker and overrides notehead colors, so label vs note mismatch. */
      coloringEnabled: settings.showColoredNotes,
      coloringMode: ColoringModes.XML,
    });

    let cancelled = false;
    const onScroll = () => {
      if (settings.showColorLabels) scheduleLabelUpdate();
    };

    let mutationObserver: MutationObserver | null = null;
    let onWindowResize: (() => void) | null = null;

    (async () => {
      try {
        await osmd.load(musicXml);
        if (cancelled) return;

        if (settings.showColoredNotes) {
          osmd.GraphicSheet?.MeasureList?.forEach((ml) => {
            ml?.forEach((sm) => {
              sm.staffEntries?.forEach((se) => {
                se.graphicalVoiceEntries?.forEach((ve) => {
                  ve.notes?.forEach((gn) => {
                    const p = pitchClassFromSourceNote(gn.sourceNote);
                    if (p && gn.sourceNote) {
                      gn.sourceNote.NoteheadColor = getPitchColor(p, settings.pitchColors);
                    }
                  });
                });
              });
            });
          });
        }

        await osmd.render();
        if (cancelled) return;
        osmdRef.current = osmd;
        applyNotationContrast(mount, osmd, nonNoteOpacityRef.current, contrastPaletteRef.current);
        // OSMD autoResize often repaints SVG on the next frame(s); contrast attributes are wiped on redraw.
        requestAnimationFrame(() => {
          if (!cancelled) applyNotationContrast(mount, osmd, nonNoteOpacityRef.current, contrastPaletteRef.current);
          requestAnimationFrame(() => {
            if (!cancelled) applyNotationContrast(mount, osmd, nonNoteOpacityRef.current, contrastPaletteRef.current);
          });
        });
        scheduleNotationContrastApply();

        if (settings.showColorLabels) {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (!cancelled) addLabelOverlays();
            });
          });
        }

        if (cancelled) return;
        const rerenderSideEffects = () => {
          scheduleNotationContrastApply();
          if (settings.showColorLabels) scheduleLabelUpdate();
        };
        const ro = new ResizeObserver(() => rerenderSideEffects());
        ro.observe(mount);
        resizeObserverRef.current = ro;

        onWindowResize = () => rerenderSideEffects();
        window.addEventListener('resize', onWindowResize);

        mutationObserver = new MutationObserver(() => rerenderSideEffects());
        mutationObserver.observe(mount, { childList: true, subtree: true });

        if (!cancelled) {
          window.addEventListener('scroll', onScroll, true);
        }
      } catch (err) {
        console.error('Error loading MusicXML:', err);
        if (!cancelled) {
          mount.innerHTML =
            '<div class="p-8 text-center text-red-600"><p class="font-semibold">Error loading music notation</p><p class="text-sm mt-2">The file might not be valid MusicXML format.</p></div>';
        }
      }
    })();

    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (contrastDebounceRef.current) {
        clearTimeout(contrastDebounceRef.current);
        contrastDebounceRef.current = null;
      }
      window.removeEventListener('scroll', onScroll, true);
      if (onWindowResize) window.removeEventListener('resize', onWindowResize);
      mutationObserver?.disconnect();
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      clearOverlays();
      osmdRef.current = null;
    };
  }, [musicXml, settings.showColoredNotes, settings.pitchColors, addLabelOverlays, clearOverlays, settings.showColorLabels, scheduleLabelUpdate, scheduleNotationContrastApply]);

  useEffect(() => {
    const mount = osmdMountRef.current;
    const osmd = osmdRef.current;
    if (!mount || !osmd?.GraphicSheet) return;
    applyNotationContrast(mount, osmd, settings.nonNoteOpacity, contrastPaletteRef.current);
  }, [settings.nonNoteOpacity]);

  useEffect(() => {
    if (settings.showColorLabels && osmdRef.current) {
      addLabelOverlays();
    } else {
      clearOverlays();
    }
  }, [settings.showColorLabels, settings.pitchColors, addLabelOverlays, clearOverlays]);

  return (
    <div
      className="osmd-outer"
      style={{
        minHeight: 300,
        position: 'relative',
        width: '100%',
        background: '#fff',
        padding: 16,
        borderRadius: 8,
        boxShadow: 'inset 0 0 0 1px #e5e5e5',
      }}
    >
      <div ref={wrapRef} className="osmd-wrap" style={{ position: 'relative', width: '100%', minHeight: 280 }}>
        <div
          ref={osmdMountRef}
          className="osmd-mount"
          style={{ position: 'relative', zIndex: 0, width: '100%' }}
        />
        <div
          ref={labelLayerRef}
          className="osmd-pitch-label-layer"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            zIndex: 1,
            pointerEvents: 'none',
            overflow: 'visible',
          }}
        />
      </div>
    </div>
  );
};
