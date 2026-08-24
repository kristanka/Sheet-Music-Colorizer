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

// Note on OSMD half tones (kept for future reference): `Pitch.getHalfTone()`
// is NOT MIDI — OSMD computes `fundamentalNote + 12 * (octave + 3) + accidental`,
// i.e. MIDI + 24 (C4 = 84, B4 = 95). Label placement is now per staff
// (see osmdDecorations.placeLabelsAboveForStaff), so no per-note pitch
// threshold is needed anymore.
