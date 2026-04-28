/**
 * Standard MIDI (format 0/1) → partwise MusicXML. divisions = PPQ.
 * Chooses a treble, bass, or two-part (grand) layout so every note sits on a real staff.
 */

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
): RawNote[] {
  const notes: RawNote[] = [];
  const on = new Map<string, number>();
  let p = { i: tStart };
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
        /* drum */
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
  return notes;
}

export function parseSmf(buf: ArrayBuffer): {
  ppq: number;
  tNum: number;
  tDen: number;
  notes: RawNote[];
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
  const all: RawNote[] = [];
  for (let tr = 0; tr < ntrk; tr++) {
    if (p.i >= b.length) break;
    const c = readChunk(b, p);
    if (c.id === 'MTrk') {
      for (const n of parseTrackData(b, c.off, c.end, divv)) {
        all.push(n);
      }
    }
  }
  if (all.length === 0) {
    throw new Error(
      'No note events found. Drums (channel 10) are skipped, or the file is empty.'
    );
  }
  return { ppq: divv, tNum: 4, tDen: 4, notes: all };
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
  return rawNotesToMusicXml(parseSmf(buf), options);
}
