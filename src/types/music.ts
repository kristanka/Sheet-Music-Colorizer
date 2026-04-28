export type PitchClass = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

export interface PitchColors {
  C: string;
  D: string;
  E: string;
  F: string;
  G: string;
  A: string;
  B: string;
}

export const DEFAULT_PITCH_COLORS: PitchColors = {
  C: '#FF3B30',
  D: '#FF9500',
  E: '#FFCC00',
  F: '#34C759',
  G: '#007AFF',
  A: '#AF52DE',
  B: '#FF99AC',
};

export interface NoteData {
  pitch: PitchClass;
  octave: number;
  x: number;
  y: number;
  duration?: string;
}

export interface MusicScore {
  notes: NoteData[];
  musicXml?: string;
}

export interface DisplaySettings {
  showColorLabels: boolean;
  showColoredNotes: boolean;
  pitchColors: PitchColors;
}

export const DEFAULT_SETTINGS: DisplaySettings = {
  showColorLabels: true,
  showColoredNotes: true,
  pitchColors: DEFAULT_PITCH_COLORS,
};
