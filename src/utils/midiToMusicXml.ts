/**
 * Standard MIDI (format 0/1) → partwise MusicXML. divisions = PPQ.
 * Chooses a treble, bass, or two-part (grand) layout so every note sits on a real staff.
 *
 * Channel 10 (`ch === 9` 0-indexed) drum events are collected separately (see `RawDrumHit`).
 * Drum-only files are emitted as a percussion-clef chart with `<unpitched>` notes positioned
 * and shaped per src/types/drums.ts. Mixed pitched + drum files keep the pitched layout and
 * silently drop the drum track (mixed support is intentionally out of scope).
 */
import { DRUM_KIT, gmKeyToDrumKey } from '../types/drums';
import type { DrumKey } from '../types/drums';

const PITCH: { step: string; alter: number }[] = [
  { step: 'C', alter: 0 },
  { step: 'C', alter: 1 },
  { step: 'D', alter: 0 },
  { step: 'D', alter: 1 },
  { step: 'E', alter: 0 },
  { step: 'F', alter: 0 },
  { step: 'F', alter: 1 },
  { step: 'G', alter: 0 },
  { step: 'G', alter: 1 },
  { step: 'A', alter: 0 },
  { step: 'A', alter: 1 },
  { step: 'B', alter: 0 },
];

export type RawNote = { s: number; e: number; k: number };

/** A drum hit on MIDI channel 10. `t` is the absolute tick; `k` is the GM percussion MIDI key. */
export type RawDrumHit = { t: number; k: number };

/** Middle C: treble = staff 1, below = staff 2 in piano. */
const SPLIT = 60;

function pitch(
  k: number
): { step: string; alter: number; oct: number } {
  const pc = ((k % 12) + 12) % 12;
  const x = PITCH[pc] ?? PITCH[0]!;
  return { step: x.step, alter: x.alter, oct: Math.floor(k / 12) - 1 };
}

function vlen(b: Uint8Array, p: { i: number }): number {
  let n = 0;
  for (let j = 0; j < 4; j++) {
    const c = b[p.i++]!;
    n = (n << 7) | (c & 0x7f);
    if ((c & 0x80) === 0) return n;
  }
  return n;
}

function u32b(b: Uint8Array, i: number): number {
  return (b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!;
}

function typeForDur(
  d: number,
  ppq: number
): { type: string; dot: boolean } {
  const w = 4 * ppq;
  if (w > 0 && w % d === 0) {
    const n = w / d;
    if (n === 1) return { type: 'whole', dot: false };
    if (n === 2) return { type: 'half', dot: false };
    if (n === 4) return { type: 'quarter', dot: false };
    if (n === 8) return { type: 'eighth', dot: false };
    if (n === 16) return { type: '16th', dot: false };
  }
  if (d * 2 === 3 * ppq) {
    return { type: 'quarter', dot: true };
  }
  return { type: 'quarter', dot: false };
}

function readChunk(
  b: Uint8Array,
  o: { i: number }
): { id: string; off: number; end: number } {
  const id = String.fromCharCode(
    b[o.i++]!,
    b[o.i++]!,
    b[o.i++]!,
    b[o.i++]!
  );
  const n = u32b(b, o.i);
  o.i += 4;
  const off = o.i;
  o.i += n;
  return { id, off, end: off + n };
}

function parseTrackData(
  b: Uint8Array,
  tStart: number,
  tEnd: number,
  ppq: number
): { pitched: RawNote[]; drums: RawDrumHit[] } {
  const notes: RawNote[] = [];
  const drums: RawDrumHit[] = [];
  const on = new Map<string, number>();
  const p = { i: tStart };
  let abs = 0;
  let rstatus = 0;

  const finish = (ch: number, key: number) => {
    if (ch === 9) return;
    const h = `${ch},${key}`;
    const t0 = on.get(h);
    if (t0 === undefined) return;
    if (abs > t0) {
      notes.push({ s: t0, e: abs, k: key });
    }
    on.delete(h);
  };

  while (p.i < tEnd) {
    abs += vlen(b, p);
    if (p.i >= tEnd) break;
    let st: number;
    if (b[p.i]! < 0x80) {
      st = rstatus;
      if (rstatus < 0x80) {
        p.i++;
        continue;
      }
    } else {
      st = b[p.i++]!;
      if (st < 0xf0) {
        rstatus = st;
      }
    }

    if (st === 0xff) {
      const t = p.i < tEnd ? b[p.i++]! : 0;
      const ln = vlen(b, p);
      p.i += ln;
      if (t === 0x2f) break;
      continue;
    }
    if (st === 0xf0 || st === 0xf7) {
      p.i += vlen(b, p);
      continue;
    }

    const hi = st & 0xf0;
    const ch = st & 0x0f;

    if (hi === 0x90) {
      const key = b[p.i++]!;
      const vel = b[p.i++]!;
      if (ch === 9) {
        // Drum hits are single-shot events; only the note-on with positive velocity matters.
        if (vel > 0) drums.push({ t: abs, k: key });
      } else if (vel > 0) {
        on.set(`${ch},${key}`, abs);
      } else {
        finish(ch, key);
      }
    } else if (hi === 0x80) {
      const key = b[p.i++]!;
      p.i++;
      finish(ch, key);
    } else if (hi === 0xc0) {
      p.i++;
    } else if (hi === 0xd0) {
      p.i++;
    } else if (hi === 0xa0 || hi === 0xe0) {
      p.i += 2;
    } else if (hi === 0xb0) {
      p.i += 2;
    } else {
      p.i = Math.min(p.i + 1, tEnd);
    }
  }
  for (const [h, t0] of on) {
    const k = +h.split(',')[1]!;
    if (!Number.isFinite(k)) continue;
    const end = Math.max(t0 + 1, t0 + Math.floor(ppq / 4));
    notes.push({ s: t0, e: end, k });
  }
  return { pitched: notes, drums };
}

export function parseSmf(buf: ArrayBuffer): {
  ppq: number;
  tNum: number;
  tDen: number;
  notes: RawNote[];
  drums: RawDrumHit[];
} {
  const b = new Uint8Array(buf);
  const p = { i: 0 };
  const c0 = readChunk(b, p);
  if (c0.id !== 'MThd' || c0.end - c0.off < 6) {
    throw new Error('Not a valid MIDI file (missing MThd).');
  }
  const i0 = c0.off;
  const ntrk = (b[i0 + 2]! << 8) | b[i0 + 3]!;
  const divv = (b[i0 + 4]! << 8) | b[i0 + 5]!;
  if (divv & 0x8000) {
    throw new Error('MIDI with SMPTE timing is not supported.');
  }
  if (divv === 0) {
    // PPQ of 0 would make measure length 0 → infinite measure loop downstream.
    throw new Error('Invalid MIDI file (PPQ is 0).');
  }
  const all: RawNote[] = [];
  const drumsAll: RawDrumHit[] = [];
  for (let tr = 0; tr < ntrk; tr++) {
    if (p.i >= b.length) break;
    const c = readChunk(b, p);
    if (c.id === 'MTrk') {
      const { pitched, drums } = parseTrackData(b, c.off, c.end, divv);
      for (const n of pitched) all.push(n);
      for (const d of drums) drumsAll.push(d);
    }
  }
  if (all.length === 0 && drumsAll.length === 0) {
    throw new Error('No note events found. The file appears to be empty.');
  }
  return { ppq: divv, tNum: 4, tDen: 4, notes: all, drums: drumsAll };
}

/**
 * One part: correct clef (G2 treble / F4 bass), one staff, filled measures.
 * @param globalMaxETick when set (e.g. full score end), all parts get the same bar count.
 */
function partMeasures(
  byS: RawNote[],
  ppq: number,
  tNum: number,
  tDen: number,
  clefSign: 'G' | 'F',
  globalMaxETick?: number
): string {
  for (const n of byS) {
    if (n.e <= n.s) n.e = n.s + 1;
  }
  byS.sort((a, b) => a.s - b.s);
  const measLen = (tNum * 4 * ppq) / tDen;
  const partEnd = byS.length ? Math.max(...byS.map((n) => n.e)) : 0;
  const endT =
    globalMaxETick != null && globalMaxETick > 0
      ? Math.max(partEnd, globalMaxETick)
      : partEnd;
  const nMeas = Math.max(1, Math.ceil(endT / measLen));
  const clef =
    clefSign === 'G'
      ? '    <clef><sign>G</sign><line>2</line></clef>'
      : '    <clef><sign>F</sign><line>4</line></clef>';
  const blocks: string[] = [];

  for (let mi = 0; mi < nMeas; mi++) {
    const m0 = mi * measLen;
    const m1 = m0 + measLen;
    const segs: { s: number; e: number; k: number }[] = [];
    for (const n of byS) {
      if (n.s < m1 && n.e > m0) {
        segs.push({
          s: Math.max(n.s, m0),
          e: Math.min(n.e, m1),
          k: n.k,
        });
      }
    }
    const out: string[] = [];
    if (mi === 0) {
      out.push(`<measure number="1">`);
      out.push('  <attributes>');
      out.push(`    <divisions>${ppq}</divisions>`);
      out.push('    <key><fifths>0</fifths></key>');
      out.push(
        `    <time><beats>${tNum}</beats><beat-type>${tDen}</beat-type></time>`
      );
      out.push(clef);
      out.push('  </attributes>');
    } else {
      out.push(`<measure number="${mi + 1}">`);
    }
    if (segs.length === 0) {
      const d = Math.round(measLen);
      const t = typeForDur(d, ppq);
      out.push(`  <note>
    <rest measure="yes"/>
    <duration>${d}</duration>
    <type>${t.type}</type>${
  t.dot ? '\n    <dot/>' : ''}
    <voice>1</voice>
    <staff>1</staff>
  </note>`);
      out.push('</measure>');
      blocks.push(out.join('\n'));
      continue;
    }
    const bySMap = new Map<number, (typeof segs)>();
    for (const s0 of segs) {
      const k0 = s0.s;
      const a = bySMap.get(k0) ?? [];
      a.push(s0);
      bySMap.set(k0, a);
    }
    for (const a of bySMap.values()) {
      a.sort((u, v) => u.k - v.k);
    }
    const starts = Array.from(bySMap.keys()).sort((a, b) => a - b);
    let cur = m0;
    for (const ts of starts) {
      if (ts > cur) {
        const r = Math.round(ts - cur);
        if (r > 0) {
          const tf = typeForDur(r, ppq);
          out.push(
            `  <note>
    <rest/>
    <duration>${r}</duration>
    <type>${tf.type}</type>${
  tf.dot ? '\n    <dot/>' : ''}
    <voice>1</voice>
    <staff>1</staff>
  </note>`
          );
        }
      }
      const grp = bySMap.get(ts)!;
      let maxE = m0;
      for (const [i, s0] of grp.entries()) {
        const d0 = Math.max(1, Math.round(s0.e - s0.s));
        maxE = Math.max(maxE, s0.s + d0);
        const q = pitch(s0.k);
        const tf = typeForDur(d0, ppq);
        const c = i > 0 ? '  <chord/>\n' : '';
        const pxml =
          q.alter !== 0
            ? `  <step>${q.step}</step>
    <alter>${q.alter}</alter>
    <octave>${q.oct}</octave>`
            : `  <step>${q.step}</step>
    <octave>${q.oct}</octave>`;
        out.push(
          `  <note>
${c}  <pitch>
    ${pxml}
  </pitch>
  <duration>${d0}</duration>
  <type>${tf.type}</type>${
  tf.dot ? '\n  <dot/>' : ''}
  <voice>1</voice>
  <staff>1</staff>
</note>`
        );
      }
      cur = maxE;
    }
    if (cur < m1) {
      const r = Math.round(m1 - cur);
      if (r > 0) {
        const tf = typeForDur(r, ppq);
        out.push(
          `  <note>
    <rest/>
    <duration>${r}</duration>
    <type>${tf.type}</type>${
  tf.dot ? '\n    <dot/>' : ''}
    <voice>1</voice>
    <staff>1</staff>
  </note>`
        );
      }
    }
    out.push('</measure>');
    blocks.push(out.join('\n'));
  }
  return blocks.join('\n');
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function workTitleBlock(title: string | undefined): string {
  const t = title?.trim();
  if (!t) return '';
  return `  <work>
    <work-title>${escapeXml(t)}</work-title>
  </work>
`;
}

export type MusicXmlBuildOptions = {
  /** Shown as &lt;work-title&gt; above the staff (e.g. derived from the MIDI file name). */
  title?: string;
};

export function rawNotesToMusicXml(
  raw: {
    ppq: number;
    tNum: number;
    tDen: number;
    notes: RawNote[];
  },
  options?: MusicXmlBuildOptions
): string {
  const { ppq, tNum, tDen, notes: all } = raw;
  const work = workTitleBlock(options?.title);
  if (all.length === 0) {
    return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.0">${work ? `\n${work}` : ''}</score-partwise>`;
  }
  const keys = all.map((n) => n.k);
  const minK = Math.min(...keys);
  const maxK = Math.max(...keys);
  /** Empty part names so OSMD does not reserve a left margin for "Right/Left" labels. */
  const pName = '<part-name></part-name>';
  if (maxK < SPLIT) {
    const pBody = partMeasures(all, ppq, tNum, tDen, 'F');
    return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.0">
${work}<part-list>
<score-part id="P1">${pName}</score-part>
</part-list>
<part id="P1">
${pBody}
</part>
</score-partwise>`;
  }
  if (minK >= SPLIT) {
    const pBody = partMeasures(all, ppq, tNum, tDen, 'G');
    return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.0">
${work}<part-list>
<score-part id="P1">${pName}</score-part>
</part-list>
<part id="P1">
${pBody}
</part>
</score-partwise>`;
  }
  const treb = all.filter((n) => n.k >= SPLIT);
  const bass = all.filter((n) => n.k < SPLIT);
  const gEnd = Math.max(...all.map((n) => n.e), 0);
  const tBody = partMeasures(treb, ppq, tNum, tDen, 'G', gEnd);
  const bBody = partMeasures(bass, ppq, tNum, tDen, 'F', gEnd);
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.0">
${work}<part-list>
<score-part id="P1">${pName}</score-part>
<score-part id="P2">${pName}</score-part>
</part-list>
<part id="P1">
${tBody}
</part>
<part id="P2">
${bBody}
</part>
</score-partwise>`;
}

// ---------------------------------------------------------------------------
// Drum chart emitter (drum-only MIDI → percussion-clef MusicXML)
// ---------------------------------------------------------------------------

type DurationChunk = { d: number; type: string; dot: boolean };

/**
 * Greedily decomposes a tick span into notatable values
 * (whole / half / quarter / eighth / 16th). Anything smaller than a 16th
 * is absorbed into a single 16th so measures always stay full.
 */
function decomposeDuration(ticks: number, ppq: number): DurationChunk[] {
  const units: DurationChunk[] = [
    { d: 4 * ppq, type: 'whole', dot: false },
    { d: 2 * ppq, type: 'half', dot: false },
    { d: ppq, type: 'quarter', dot: false },
    { d: ppq / 2, type: 'eighth', dot: false },
    { d: ppq / 4, type: '16th', dot: false },
  ];
  const out: DurationChunk[] = [];
  let rem = ticks;
  while (rem >= ppq / 4 - 0.001) {
    const u = units.find((x) => x.d <= rem + 0.001);
    if (!u) break;
    out.push({ d: Math.round(u.d), type: u.type, dot: false });
    rem -= u.d;
  }
  if (out.length === 0 && ticks > 0) {
    out.push({ d: Math.round(ticks), type: '16th', dot: false });
  }
  return out;
}

type DrumEvent =
  | { kind: 'rest'; d: number; type: string }
  | { kind: 'chord'; keys: DrumKey[]; d: number; type: string; start: number };

function drumRestXml(d: number, type: string): string {
  return `  <note>
    <rest/>
    <duration>${d}</duration>
    <voice>1</voice>
    <type>${type}</type>
  </note>`;
}

function drumNoteXml(
  key: DrumKey,
  d: number,
  type: string,
  isChordMember: boolean,
  beam: 'begin' | 'continue' | 'end' | null,
  stem: 'up' | 'down'
): string {
  const piece = DRUM_KIT[key];
  const lines: string[] = ['  <note>'];
  if (isChordMember) lines.push('    <chord/>');
  lines.push(
    '    <unpitched>',
    `      <display-step>${piece.displayStep}</display-step>`,
    `      <display-octave>${piece.displayOctave}</display-octave>`,
    '    </unpitched>',
    `    <duration>${d}</duration>`,
    '    <voice>1</voice>',
    `    <type>${type}</type>`,
    `    <stem>${stem}</stem>`
  );
  if (piece.notehead !== 'normal') {
    lines.push(`    <notehead>${piece.notehead}</notehead>`);
  }
  if (beam && !isChordMember) {
    lines.push(`    <beam number="1">${beam}</beam>`);
  }
  lines.push('  </note>');
  return lines.join('\n');
}

/**
 * Emits the `<measure>` blocks of a percussion part.
 * Hits are quantized to a 16th grid; simultaneous hits become chords; a hit
 * "rings" until the next onset, capped at a quarter note (drum-chart
 * convention), with rests filling the remainder. Eighths/16ths within the
 * same beat are beamed.
 */
function drumChartMeasures(
  hits: RawDrumHit[],
  ppq: number,
  tNum: number,
  tDen: number
): string {
  const grid = Math.max(1, Math.round(ppq / 4)); // 16th-note quantization
  const byTick = new Map<number, Set<DrumKey>>();
  let maxT = 0;
  for (const h of hits) {
    const t = Math.round(h.t / grid) * grid;
    maxT = Math.max(maxT, t);
    const set = byTick.get(t) ?? new Set<DrumKey>();
    set.add(gmKeyToDrumKey(h.k));
    byTick.set(t, set);
  }
  const onsets = Array.from(byTick.keys()).sort((a, b) => a - b);
  const measLen = (tNum * 4 * ppq) / tDen;
  const nMeas = Math.max(1, Math.floor(maxT / measLen) + 1);
  const blocks: string[] = [];
  let oi = 0;

  for (let mi = 0; mi < nMeas; mi++) {
    const m0 = mi * measLen;
    const m1 = m0 + measLen;
    const events: DrumEvent[] = [];
    let cur = m0;

    while (oi < onsets.length && onsets[oi]! < m1) {
      const ts = onsets[oi]!;
      for (const c of decomposeDuration(ts - cur, ppq)) {
        events.push({ kind: 'rest', d: c.d, type: c.type });
      }
      const nextOnset = oi + 1 < onsets.length ? onsets[oi + 1]! : m1;
      const gap = Math.min(nextOnset, m1) - ts;
      // Note value: until the next onset, capped at a quarter (drum convention).
      const noteChunk = decomposeDuration(Math.min(gap, ppq), ppq)[0]!;
      const keys = Array.from(byTick.get(ts)!);
      // Stable visual order: staff position bottom-up (kick first).
      keys.sort((a, b) => {
        const pa = DRUM_KIT[a];
        const pb = DRUM_KIT[b];
        return pa.displayOctave - pb.displayOctave || pa.displayStep.charCodeAt(0) - pb.displayStep.charCodeAt(0);
      });
      events.push({ kind: 'chord', keys, d: noteChunk.d, type: noteChunk.type, start: ts });
      cur = ts + noteChunk.d;
      // Rests between the note's end and the next onset (or measure end).
      const restEnd = Math.min(nextOnset, m1);
      for (const c of decomposeDuration(restEnd - cur, ppq)) {
        events.push({ kind: 'rest', d: c.d, type: c.type });
      }
      cur = restEnd;
      oi++;
    }

    const out: string[] = [];
    if (mi === 0) {
      out.push('<measure number="1">');
      out.push('  <attributes>');
      out.push(`    <divisions>${ppq}</divisions>`);
      out.push(`    <time><beats>${tNum}</beats><beat-type>${tDen}</beat-type></time>`);
      out.push('    <clef><sign>percussion</sign><line>2</line></clef>');
      out.push('  </attributes>');
    } else {
      out.push(`<measure number="${mi + 1}">`);
    }

    if (events.length === 0) {
      const d = Math.round(measLen);
      out.push(`  <note>
    <rest measure="yes"/>
    <duration>${d}</duration>
    <voice>1</voice>
  </note>`);
      out.push('</measure>');
      blocks.push(out.join('\n'));
      continue;
    }

    // Trailing rests to the barline.
    if (cur < m1) {
      for (const c of decomposeDuration(m1 - cur, ppq)) {
        events.push({ kind: 'rest', d: c.d, type: c.type });
      }
    }

    // Beam consecutive flagged chords within the same beat.
    const beamable = (e: DrumEvent): boolean =>
      e.kind === 'chord' && (e.type === 'eighth' || e.type === '16th');
    const beatOf = (e: DrumEvent): number =>
      e.kind === 'chord' ? Math.floor((e.start - m0) / ppq) : -1;
    const beams = new Map<DrumEvent, 'begin' | 'continue' | 'end'>();
    let group: DrumEvent[] = [];
    const flushGroup = () => {
      if (group.length >= 2) {
        group.forEach((e, i) => {
          beams.set(e, i === 0 ? 'begin' : i === group.length - 1 ? 'end' : 'continue');
        });
      }
      group = [];
    };
    let groupBeat = -1;
    for (const e of events) {
      if (beamable(e) && (group.length === 0 || beatOf(e) === groupBeat)) {
        if (group.length === 0) groupBeat = beatOf(e);
        group.push(e);
      } else {
        flushGroup();
        if (beamable(e)) {
          groupBeat = beatOf(e);
          group.push(e);
        }
      }
    }
    flushGroup();

    for (const e of events) {
      if (e.kind === 'rest') {
        out.push(drumRestXml(e.d, e.type));
      } else {
        const beam = beams.get(e) ?? null;
        // One stem per chord: down only when every piece is foot-played
        // (kick, pedal hat) — mixed hand+foot chords keep the up-stem.
        const stem: 'up' | 'down' = e.keys.every((k) => DRUM_KIT[k].stem === 'down')
          ? 'down'
          : 'up';
        e.keys.forEach((k, i) => {
          out.push(drumNoteXml(k, e.d, e.type, i > 0, beam, stem));
        });
      }
    }
    out.push('</measure>');
    blocks.push(out.join('\n'));
  }
  return blocks.join('\n');
}

/** Drum-only MIDI → single percussion-clef part. */
export function drumHitsToMusicXml(
  raw: { ppq: number; tNum: number; tDen: number; drums: RawDrumHit[] },
  options?: MusicXmlBuildOptions
): string {
  const work = workTitleBlock(options?.title);
  const body = drumChartMeasures(raw.drums, raw.ppq, raw.tNum, raw.tDen);
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.0">
${work}<part-list>
<score-part id="P1"><part-name></part-name></score-part>
</part-list>
<part id="P1">
${body}
</part>
</score-partwise>`;
}

/** Strip extension for display as score title (e.g. "song.mid" → "song"). */
export function titleFromFileName(fileName: string): string {
  if (!fileName) return 'Untitled';
  const i = fileName.lastIndexOf('.');
  if (i <= 0) return fileName;
  const stem = fileName.slice(0, i);
  return stem.length > 0 ? stem : 'Untitled';
}

/** First chunk of a Standard MIDI File is "MThd" — works when the file has no .mid extension. */
export function isStandardMidiFile(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 4) return false;
  const u8 = new Uint8Array(buf);
  return u8[0] === 0x4d && u8[1] === 0x54 && u8[2] === 0x68 && u8[3] === 0x64;
}

export function midiFileToMusicXml(
  buf: ArrayBuffer,
  options?: MusicXmlBuildOptions
): string {
  const raw = parseSmf(buf);
  // Drum-only file → percussion chart. Mixed files keep the pitched layout
  // (drum track dropped — mixed support is intentionally out of scope).
  if (raw.notes.length === 0 && raw.drums.length > 0) {
    return drumHitsToMusicXml(raw, options);
  }
  return rawNotesToMusicXml(raw, options);
}
