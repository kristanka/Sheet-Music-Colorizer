import type { Note, OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import type { DrumKey, DrumNoteheadShape } from '../types/drums';
import { drumKeyFromStaffPositionExact, drumKeyFromStaffPositionLoose } from '../types/drums';

/**
 * "Drum-only" check: every visible note is `<unpitched>` and the score has at least one note.
 * A mixed score (any `<pitch>` element) returns false — we keep the existing pitched
 * rendering path for those (drum-only support was the agreed scope).
 */
export function isDrumOnlyMusicXml(xml: string): boolean {
  if (!xml) return false;
  // Cheap textual prefilter: if there's no <unpitched, skip the DOM parse.
  if (!/<unpitched\b/i.test(xml)) return false;
  try {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.querySelector('parsererror')) return false;
    const unpitched = doc.querySelectorAll('unpitched').length;
    if (unpitched === 0) return false;
    const pitched = doc.querySelectorAll('note > pitch').length;
    return pitched === 0;
  } catch {
    return false;
  }
}

/**
 * Drum-only check on a LOADED OSMD sheet. Works for every input format —
 * including compressed .mxl passed as a Blob, where the XML string check
 * (`isDrumOnlyMusicXml`) can't run. Call after `osmd.load()` + `render()`.
 */
export function isDrumOnlyOsmdSheet(osmd: OpenSheetMusicDisplay): boolean {
  let hasDrum = false;
  let hasPitched = false;
  osmd.GraphicSheet?.MeasureList?.forEach((ml) => {
    ml?.forEach((sm) => {
      sm?.staffEntries?.forEach((se) => {
        se.graphicalVoiceEntries?.forEach((ve) => {
          for (const n of ve.parentVoiceEntry?.Notes ?? []) {
            if (!n || n.isRest?.()) continue;
            if (drumKeyFromOsmdNote(n) != null) hasDrum = true;
            else if (n.Pitch != null) hasPitched = true;
          }
        });
      });
    });
  });
  return hasDrum && !hasPitched;
}

/**
 * NoteEnum mapping used by OSMD for `displayStepUnpitched`.
 * Values follow MusicXML: C=0, D=2, E=4, F=5, G=7, A=9, B=11.
 */
const NOTE_ENUM_TO_STEP: Record<number, 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B'> = {
  0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B',
};

/**
 * OSMD's NoteHeadShape enum (from opensheetmusicdisplay/.../Notehead.d.ts):
 *   CIRCLEX = 0, DIAMOND = 1, NORMAL = 2, NONE = 3, RECTANGLE = 4,
 *   SLASH   = 5, SQUARE  = 6, TRIANGLE = 7, TRIANGLE_INVERTED = 8, X = 9
 * We only need the few values that map to drum conventions.
 */
function osmdNoteheadShapeToDrumShape(shape: unknown): DrumNoteheadShape {
  switch (shape) {
    case 0: return 'circle-x';
    case 1: return 'diamond';
    case 7:
    case 8: return 'triangle';
    case 9: return 'x';
    default: return 'normal';
  }
}

/**
 * Resolve which kit piece a rendered drum note represents from its staff position
 * (display-step / display-octave) plus optional notehead shape.
 *
 * `Note` here is the OSMD source note. For drum charts it has `displayStepUnpitched`
 * (NoteEnum) and `displayOctaveUnpitched` populated by OSMD's MusicXML reader.
 * Returns null for pitched notes (no `displayStepUnpitched`) — that field is the
 * marker that the note came from `<unpitched>`.
 *
 * OSMD's reader paths are inconsistent about the stored octave (some keep the raw
 * XML value, some subtract its internal offset of 3), and it also synthesizes a
 * `Pitch` from the display position. We therefore try several coordinate
 * candidates: exact shape matches first, then position-only matches.
 */
export function drumKeyFromOsmdNote(note: Note | undefined | null): DrumKey | null {
  if (!note) return null;
  if (note.isRest?.()) return null;
  const stepEnum = (note as unknown as { displayStepUnpitched?: number }).displayStepUnpitched;
  const octaveRaw = (note as unknown as { displayOctaveUnpitched?: number })
    .displayOctaveUnpitched;
  if (stepEnum == null || octaveRaw == null) return null;

  const headShape = (note as unknown as { Notehead?: { Shape?: number } }).Notehead?.Shape;
  const drumShape = osmdNoteheadShapeToDrumShape(headShape);

  const candidates: { step: 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B'; octave: number }[] = [];
  const pushCandidates = (se: number | undefined, oct: number | undefined) => {
    if (se == null || oct == null) return;
    const step = NOTE_ENUM_TO_STEP[se];
    if (!step) return;
    for (const off of [0, 3, -3]) {
      const o = oct + off;
      if (o >= 0 && o <= 9 && !candidates.some((c) => c.step === step && c.octave === o)) {
        candidates.push({ step, octave: o });
      }
    }
  };
  pushCandidates(stepEnum, octaveRaw);
  const pitch = (note as unknown as { Pitch?: { FundamentalNote?: number; Octave?: number } })
    .Pitch;
  pushCandidates(pitch?.FundamentalNote, pitch?.Octave);

  for (const c of candidates) {
    const k = drumKeyFromStaffPositionExact(c.step, c.octave, drumShape);
    if (k) return k;
  }
  for (const c of candidates) {
    const k = drumKeyFromStaffPositionLoose(c.step, c.octave);
    if (k) return k;
  }
  return 'other';
}
