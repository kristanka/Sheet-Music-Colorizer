/**
 * Canonical drum-kit pieces we recognise, color, and label.
 *
 * Each piece carries:
 * - a short abbreviation shown as the overlay label
 * - a default color
 * - the staff position it should occupy on a 5-line percussion staff
 *   (display-step / display-octave use treble-clef-like coordinates: middle line = C5)
 * - the notehead shape (cymbals use 'x', side stick / ride bell use 'circle-x')
 * - the conventional stem direction ('down' for foot-played pieces — kick + hi-hat pedal)
 *
 * Position picks follow the de-facto modern drum-key (Norman Weinberg / Hal Leonard) used by
 * Finale, MuseScore, Sibelius. Some pieces share the same staff position with different noteheads
 * (e.g. snare = C5 normal vs side stick = C5 circle-x; ride = F5 X vs ride bell = F5 circle-x).
 */
export type DrumKey =
  | 'kick'
  | 'snare'
  | 'sideStick'
  | 'tomLow'
  | 'tomMid'
  | 'tomHigh'
  | 'hatClosed'
  | 'hatOpen'
  | 'hatPedal'
  | 'crash'
  | 'china'
  | 'splash'
  | 'ride'
  | 'rideBell'
  | 'cowbell'
  | 'clap'
  | 'tambourine'
  | 'other';

export type DrumNoteheadShape = 'normal' | 'x' | 'circle-x' | 'diamond' | 'triangle';
export type DrumGroup = 'drum' | 'cymbal' | 'aux';
export type DrumStem = 'up' | 'down';

export interface DrumPiece {
  key: DrumKey;
  /** Short label drawn over the note (≤ 3 characters preferred). */
  abbrev: string;
  /** Full kit-piece name shown in the legend / settings sidebar. */
  name: string;
  /** Default note-head colour. */
  color: string;
  /** MusicXML <display-step>. */
  displayStep: 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
  /** MusicXML <display-octave>. */
  displayOctave: number;
  /** Notehead shape used in MusicXML <notehead> and matched on inference. */
  notehead: DrumNoteheadShape;
  group: DrumGroup;
  stem: DrumStem;
}

export const DRUM_KIT: Record<DrumKey, DrumPiece> = {
  kick:       { key: 'kick',       abbrev: 'K',  name: 'Kick',           color: '#1d1d1f', displayStep: 'F', displayOctave: 4, notehead: 'normal',   group: 'drum',   stem: 'down' },
  snare:      { key: 'snare',      abbrev: 'S',  name: 'Snare',          color: '#FF3B30', displayStep: 'C', displayOctave: 5, notehead: 'normal',   group: 'drum',   stem: 'up'   },
  sideStick:  { key: 'sideStick',  abbrev: 'SS', name: 'Side stick',     color: '#FF6F61', displayStep: 'C', displayOctave: 5, notehead: 'circle-x', group: 'drum',   stem: 'up'   },
  tomLow:     { key: 'tomLow',     abbrev: 'T3', name: 'Floor tom',      color: '#8B4513', displayStep: 'A', displayOctave: 4, notehead: 'normal',   group: 'drum',   stem: 'up'   },
  tomMid:     { key: 'tomMid',     abbrev: 'T2', name: 'Mid tom',        color: '#D2691E', displayStep: 'D', displayOctave: 5, notehead: 'normal',   group: 'drum',   stem: 'up'   },
  tomHigh:    { key: 'tomHigh',    abbrev: 'T1', name: 'High tom',       color: '#FF9500', displayStep: 'E', displayOctave: 5, notehead: 'normal',   group: 'drum',   stem: 'up'   },
  hatClosed:  { key: 'hatClosed',  abbrev: 'HH', name: 'Hi-hat (closed)', color: '#FFCC00', displayStep: 'G', displayOctave: 5, notehead: 'x',       group: 'cymbal', stem: 'up'   },
  hatOpen:    { key: 'hatOpen',    abbrev: 'OH', name: 'Hi-hat (open)',   color: '#FFD60A', displayStep: 'G', displayOctave: 5, notehead: 'circle-x',group: 'cymbal', stem: 'up'   },
  hatPedal:   { key: 'hatPedal',   abbrev: 'PH', name: 'Hi-hat (pedal)',  color: '#A07A00', displayStep: 'D', displayOctave: 4, notehead: 'x',       group: 'cymbal', stem: 'down' },
  crash:      { key: 'crash',      abbrev: 'C',  name: 'Crash',          color: '#34C759', displayStep: 'A', displayOctave: 5, notehead: 'x',        group: 'cymbal', stem: 'up'   },
  china:      { key: 'china',      abbrev: 'CN', name: 'China',          color: '#5AC8FA', displayStep: 'B', displayOctave: 5, notehead: 'x',        group: 'cymbal', stem: 'up'   },
  splash:     { key: 'splash',     abbrev: 'SP', name: 'Splash',         color: '#64D2FF', displayStep: 'B', displayOctave: 5, notehead: 'circle-x', group: 'cymbal', stem: 'up'   },
  ride:       { key: 'ride',       abbrev: 'R',  name: 'Ride',           color: '#007AFF', displayStep: 'F', displayOctave: 5, notehead: 'x',        group: 'cymbal', stem: 'up'   },
  rideBell:   { key: 'rideBell',   abbrev: 'RB', name: 'Ride bell',      color: '#0040DD', displayStep: 'F', displayOctave: 5, notehead: 'diamond',  group: 'cymbal', stem: 'up'   },
  cowbell:    { key: 'cowbell',    abbrev: 'CB', name: 'Cowbell',        color: '#AF52DE', displayStep: 'D', displayOctave: 5, notehead: 'triangle', group: 'aux',    stem: 'up'   },
  clap:       { key: 'clap',       abbrev: 'CL', name: 'Clap',           color: '#FF99AC', displayStep: 'B', displayOctave: 4, notehead: 'x',        group: 'aux',    stem: 'up'   },
  tambourine: { key: 'tambourine', abbrev: 'TB', name: 'Tambourine',     color: '#BF5AF2', displayStep: 'E', displayOctave: 5, notehead: 'circle-x', group: 'aux',    stem: 'up'   },
  other:      { key: 'other',      abbrev: '?',  name: 'Other',          color: '#8E8E93', displayStep: 'C', displayOctave: 5, notehead: 'normal',   group: 'aux',    stem: 'up'   },
};

/** Default colour for each drum, used when settings don't override. */
export type DrumColors = Record<DrumKey, string>;

export const DEFAULT_DRUM_COLORS: DrumColors = (Object.fromEntries(
  (Object.keys(DRUM_KIT) as DrumKey[]).map((k) => [k, DRUM_KIT[k].color])
) as DrumColors);

/**
 * Order used by the legend / settings panel: high-frequency pieces first,
 * accessories last, "other" omitted from the legend (still settable in advanced cases).
 */
export const DRUM_LEGEND_ORDER: DrumKey[] = [
  'kick', 'snare', 'sideStick',
  'hatClosed', 'hatOpen', 'hatPedal',
  'tomHigh', 'tomMid', 'tomLow',
  'ride', 'rideBell', 'crash', 'china', 'splash',
  'cowbell', 'clap', 'tambourine',
];

/**
 * General MIDI percussion key map (channel 10 / index 9 in 0-based MIDI status bytes).
 * Source: GM Level 1 percussion map. Anything not listed maps to `'other'`.
 */
const GM_DRUM_MAP: Record<number, DrumKey> = {
  35: 'kick',        // Acoustic Bass Drum
  36: 'kick',        // Bass Drum 1
  37: 'sideStick',   // Side Stick
  38: 'snare',       // Acoustic Snare
  39: 'clap',        // Hand Clap
  40: 'snare',       // Electric Snare
  41: 'tomLow',      // Low Floor Tom
  42: 'hatClosed',   // Closed Hi-Hat
  43: 'tomLow',      // High Floor Tom
  44: 'hatPedal',    // Pedal Hi-Hat
  45: 'tomMid',      // Low Tom
  46: 'hatOpen',     // Open Hi-Hat
  47: 'tomMid',      // Low-Mid Tom
  48: 'tomHigh',     // Hi-Mid Tom
  49: 'crash',       // Crash Cymbal 1
  50: 'tomHigh',     // High Tom
  51: 'ride',        // Ride Cymbal 1
  52: 'china',       // Chinese Cymbal
  53: 'rideBell',    // Ride Bell
  54: 'tambourine',  // Tambourine
  55: 'splash',      // Splash Cymbal
  56: 'cowbell',     // Cowbell
  57: 'crash',       // Crash Cymbal 2
  58: 'other',       // Vibraslap
  59: 'ride',        // Ride Cymbal 2
  60: 'tomHigh',     // Hi Bongo  -> nearest tom
  61: 'tomMid',      // Low Bongo
  62: 'tomMid',      // Mute Hi Conga
  63: 'tomMid',      // Open Hi Conga
  64: 'tomLow',      // Low Conga
};

export function gmKeyToDrumKey(midiKey: number): DrumKey {
  const direct = GM_DRUM_MAP[midiKey];
  if (direct) return direct;
  // Extended keys below the GM range (35+): dance / electronic kits commonly lay
  // out kick–snare–hat variants an octave below GM (e.g. 26 = snare, 30 = closed
  // hat). Try the octave-up GM slot first; remaining very low keys are almost
  // always electronic kick variants (verified against real dance-kit MIDI files).
  if (midiKey >= 20 && midiKey < 35) {
    const octaveUp = GM_DRUM_MAP[midiKey + 12];
    if (octaveUp) return octaveUp;
    return 'kick';
  }
  return 'other';
}

// ---------------------------------------------------------------------------
// Family grouping for the color UI: 18 kit pieces are too many pickers, so the
// UI edits one color per family and applies it to every piece in the family.
// Labels still use the per-piece abbreviation (HH vs OH stay distinguishable).
// ---------------------------------------------------------------------------

export type DrumFamily = 'kick' | 'snare' | 'hihat' | 'cymbals' | 'toms' | 'perc';

export const DRUM_FAMILIES: Record<
  DrumFamily,
  { name: string; abbrev: string; keys: DrumKey[] }
> = {
  kick: { name: 'Kick', abbrev: 'K', keys: ['kick'] },
  snare: { name: 'Snare', abbrev: 'S', keys: ['snare', 'sideStick', 'clap'] },
  hihat: { name: 'Hi-hat', abbrev: 'HH', keys: ['hatClosed', 'hatOpen', 'hatPedal'] },
  cymbals: { name: 'Cymbals', abbrev: 'CY', keys: ['crash', 'china', 'splash', 'ride', 'rideBell'] },
  toms: { name: 'Toms', abbrev: 'T', keys: ['tomLow', 'tomMid', 'tomHigh'] },
  perc: { name: 'Percussion', abbrev: 'P', keys: ['cowbell', 'tambourine', 'other'] },
};

export const DRUM_FAMILY_ORDER: DrumFamily[] = [
  'kick',
  'snare',
  'hihat',
  'cymbals',
  'toms',
  'perc',
];

/** The color shown on a family's swatch: the family's first piece's current color. */
export function drumFamilyColor(family: DrumFamily, colors: DrumColors): string {
  const firstKey = DRUM_FAMILIES[family].keys[0]!;
  return drumColor(firstKey, colors);
}

/** Returns a new DrumColors with every piece in `family` set to `color`. */
export function withDrumFamilyColor(
  colors: DrumColors,
  family: DrumFamily,
  color: string
): DrumColors {
  const next = { ...colors };
  for (const key of DRUM_FAMILIES[family].keys) next[key] = color;
  return next;
}

/** Exact staff-position + notehead-shape match, or null. */
export function drumKeyFromStaffPositionExact(
  step: 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B',
  octave: number,
  notehead: DrumNoteheadShape
): DrumKey | null {
  for (const key of Object.keys(DRUM_KIT) as DrumKey[]) {
    if (key === 'other') continue;
    const p = DRUM_KIT[key];
    if (p.displayStep === step && p.displayOctave === octave && p.notehead === notehead) {
      return key;
    }
  }
  return null;
}

/** Staff-position match with any notehead (helps loosely-formatted input), or null. */
export function drumKeyFromStaffPositionLoose(
  step: 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B',
  octave: number
): DrumKey | null {
  for (const key of Object.keys(DRUM_KIT) as DrumKey[]) {
    if (key === 'other') continue;
    const p = DRUM_KIT[key];
    if (p.displayStep === step && p.displayOctave === octave) return key;
  }
  return null;
}

/**
 * Inverse lookup: from staff position + notehead shape, derive the most likely DrumKey.
 * Used when reading arbitrary user-supplied MusicXML drum charts.
 */
export function drumKeyFromStaffPosition(
  step: 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B',
  octave: number,
  notehead: DrumNoteheadShape
): DrumKey {
  return (
    drumKeyFromStaffPositionExact(step, octave, notehead) ??
    drumKeyFromStaffPositionLoose(step, octave) ??
    'other'
  );
}

export function drumColor(key: DrumKey, colors: DrumColors): string {
  return colors[key] ?? DRUM_KIT[key].color;
}
