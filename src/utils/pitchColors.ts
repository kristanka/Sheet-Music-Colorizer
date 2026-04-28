import type { PitchClass, PitchColors } from '../types/music';

export function getPitchColor(pitch: PitchClass, colors: PitchColors): string {
  return colors[pitch] || '#000000';
}

export function extractPitchClass(noteName: string): PitchClass | null {
  const match = noteName.match(/^([A-Ga-g])/);
  if (match) {
    return match[1].toUpperCase() as PitchClass;
  }
  return null;
}

export function midiToPitch(midiNumber: number): { pitch: PitchClass; octave: number } {
  const pitchClasses: PitchClass[] = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
  const octave = Math.floor(midiNumber / 12) - 1;
  const pitchIndex = midiNumber % 12;
  return {
    pitch: pitchClasses[pitchIndex],
    octave,
  };
}

export function stepToPitch(step: string): PitchClass {
  const normalized = step.toUpperCase();
  if (['C', 'D', 'E', 'F', 'G', 'A', 'B'].includes(normalized)) {
    return normalized as PitchClass;
  }
  return 'C';
}

export function formatPitchLabel(pitch: PitchClass, octave?: number): string {
  if (octave !== undefined) {
    return `${pitch}${octave}`;
  }
  return pitch;
}
