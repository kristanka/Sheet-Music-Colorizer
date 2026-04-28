import type { PitchClass } from '../types/music';

/**
 * OpenSheetMusicDisplay / MusicXML NoteEnum: C=0, D=2, E=4, F=5, G=7, A=9, B=11
 * (Not 0..6 — that was a bug and caused wrong / missing label letters.)
 */
const FUNDAMENTAL_TO_PITCH: Record<number, PitchClass> = {
  0: 'C',
  2: 'D',
  4: 'E',
  5: 'F',
  7: 'G',
  9: 'A',
  11: 'B',
};

export function fundamentalNoteToPitchClass(fundamental: number): PitchClass | null {
  return FUNDAMENTAL_TO_PITCH[fundamental] ?? null;
}

/** MIDI (C4=60) — B4 = 71, C5 = 72. Used when `Pitch.getHalfTone()` is in the same range. */
const B4_MIDI = 71;

/**
 * B4 and lower: label under the note (below staff area).
 * Strictly above B4: label above the note (above staff).
 * Prefers `getHalfTone()` when in a plausible MIDI-like range; otherwise `Octave > 4` (C5+ in MusicXML).
 */
export function isStrictlyAboveB4(
  pitch: { Octave: number; getHalfTone?: () => number } | null | undefined
): boolean {
  if (!pitch) return false;
  if (typeof pitch.getHalfTone === 'function') {
    const h = pitch.getHalfTone();
    if (Number.isFinite(h) && h >= 24 && h <= 127) {
      return h > B4_MIDI;
    }
  }
  return pitch.Octave > 4;
}
