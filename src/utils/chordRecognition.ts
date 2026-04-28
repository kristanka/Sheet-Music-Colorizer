import type { Note, Pitch } from 'opensheetmusicdisplay';
import type { PitchClass } from '../types/music';
import { getPitchColor } from './pitchColors';
import type { PitchColors } from '../types/music';

/** 12-TET to sharp-style names. */
const CHROMA: readonly string[] = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
];

type Template = { iv: string; name: (root: string) => string; priority: number };

const TEMPLATES: Template[] = [
  { iv: '0,4,7,10', name: (r) => `${r}7`, priority: 2 },
  { iv: '0,4,7,11', name: (r) => `${r}maj7`, priority: 2 },
  { iv: '0,3,7,10', name: (r) => `${r}m7`, priority: 2 },
  { iv: '0,3,6,10', name: (r) => `${r}m7b5`, priority: 2 },
  { iv: '0,3,6,9', name: (r) => `${r}o7`, priority: 2 },
  { iv: '0,4,7,9', name: (r) => `${r}6`, priority: 2 },
  { iv: '0,4,7', name: (r) => `${r}`, priority: 1 },
  { iv: '0,3,7', name: (r) => `${r}m`, priority: 1 },
  { iv: '0,3,6', name: (r) => `${r}dim`, priority: 1 },
  { iv: '0,4,8', name: (r) => `${r}aug`, priority: 1 },
  { iv: '0,2,7', name: (r) => `${r}sus2`, priority: 1 },
  { iv: '0,5,7', name: (r) => `${r}sus4`, priority: 1 },
];

function intervalSetFromRoot(root: number, pcs: Set<number>): string {
  const arr: number[] = [0];
  for (const p of pcs) {
    arr.push((p - root + 12) % 12);
  }
  return [...new Set(arr)].sort((a, b) => a - b).join(',');
}

function toShortName(note: Note): string {
  if (note.isRest?.() || !note.Pitch) return '';
  if (typeof note.ToStringShort === 'function') {
    return note.ToStringShort(0) ?? '';
  }
  if (note.Pitch.getHalfTone) {
    const h = note.Pitch.getHalfTone();
    if (Number.isFinite(h)) return CHROMA[((h % 12) + 12) % 12] ?? String(h);
  }
  return '';
}

export function getHalfTone(n: Note): number | null {
  if (n.isRest?.() || !n.Pitch) return null;
  if (typeof n.Pitch.getHalfTone === 'function') {
    const h = n.Pitch.getHalfTone();
    if (Number.isFinite(h)) return h;
  }
  return null;
}

const MIDI_PC_TO_PITCH: readonly PitchClass[] = [
  'C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B',
];

function pcToKeyColorRoot(rootPc: number): PitchClass {
  return MIDI_PC_TO_PITCH[((rootPc % 12) + 12) % 12] ?? 'C';
}

export type ChordInfo = {
  label: string;
  /** 0..11, for key colors */
  rootPc: number;
  /** Lowest pitch in the block — staff position for “above / below B4” */
  bassPitch: Pitch | null;
  pitched: Note[];
};

/**
 * Chord (or single-note) label from a simultaneous voice (one OSMD VoiceEntry).
 */
export function chordInfoFromSourceNotes(notes: (Note | undefined)[]): ChordInfo {
  const empty: ChordInfo = {
    label: '',
    rootPc: 0,
    bassPitch: null,
    pitched: [],
  };
  const pitched = notes.filter(
    (n): n is Note =>
      n != null && !n.isRest?.() && n.Pitch != null
  );
  if (pitched.length === 0) return empty;

  let rootPc = 0;
  let label = '';
  const mts = pitched
    .map((n) => getHalfTone(n))
    .filter((h): h is number => h != null);
  if (mts.length < pitched.length) {
    return {
      label: pitched
        .map((n) => toShortName(n))
        .filter(Boolean)
        .join('·'),
      rootPc: mts[0] != null ? mts[0] % 12 : 0,
      bassPitch: pitched[0]!.Pitch,
      pitched,
    };
  }

  const minMidi = Math.min(...mts);
  const bassPc = ((minMidi % 12) + 12) % 12;
  const u = new Set(
    mts.map((h) => ((h % 12) + 12) % 12)
  ) as Set<number>;
  const bassSource =
    pitched.find((n) => getHalfTone(n) === minMidi) ?? pitched[0]!;

  if (u.size === 1) {
    rootPc = ((minMidi % 12) + 12) % 12;
    return {
      label: toShortName(pitched[0]!),
      rootPc,
      bassPitch: pitched[0]!.Pitch,
      pitched,
    };
  }

  if (u.size === 2) {
    const [p0, p1] = Array.from(u).sort((x, y) => x! - y!);
    const d = p1! - p0!; // 0..11
    const dShort = d <= 6 ? d : 12 - d;
    const r = p0!;
    rootPc = r;

    if (dShort === 7) {
      label = nameWithSlash(
        r,
        bassPc,
        `${CHROMA[r]!}5`
      );
    } else if (dShort === 4) {
      label = nameWithSlash(r, bassPc, CHROMA[r]!);
    } else if (dShort === 3) {
      label = nameWithSlash(r, bassPc, `${CHROMA[r]!}m`);
    } else {
      label = mts
        .slice()
        .sort((a, b) => a - b)
        .map((h) => CHROMA[((h % 12) + 12) % 12])
        .join('·');
    }
    return { label, rootPc, bassPitch: bassSource.Pitch, pitched };
  }

  let best: { root: number; t: Template } | null = null;
  for (let r = 0; r < 12; r++) {
    if (!u.has(r)) continue;
    const key = intervalSetFromRoot(r, u);
    const matches = TEMPLATES.filter((t) => t.iv === key);
    for (const t of matches) {
      if (!best || t.priority > best.t.priority) {
        best = { root: r, t };
      } else if (t.priority === best.t.priority) {
        if (Math.abs(r - bassPc) < Math.abs(best.root - bassPc)) {
          best = { root: r, t };
        }
      }
    }
  }

  if (best) {
    rootPc = best.root;
    const rName = CHROMA[best.root] ?? '?';
    label = nameWithSlash(
      best.root,
      bassPc,
      best.t.name(rName)
    );
    return { label, rootPc, bassPitch: bassSource.Pitch, pitched };
  }

  return {
    label: mts
      .slice()
      .sort((a, b) => a - b)
      .map((h) => CHROMA[((h % 12) + 12) % 12])
      .join('·'),
    rootPc: bassPc,
    bassPitch: bassSource.Pitch,
    pitched,
  };
}

function nameWithSlash(
  rootPc: number,
  bassPc: number,
  name: string
): string {
  if (bassPc === rootPc) {
    return name;
  }
  return `${name}/${CHROMA[bassPc]}`;
}

export function colorForChordInfo(info: ChordInfo, colors: PitchColors): string {
  if (!info.label) return '#1d1d1f';
  return getPitchColor(pcToKeyColorRoot(info.rootPc), colors);
}
