import type { NoteData, PitchClass } from '../types/music';
import { stepToPitch } from './pitchColors';

export function parseMusicXML(xmlString: string): NoteData[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');
  const notes: NoteData[] = [];

  const noteElements = doc.querySelectorAll('note');
  let currentX = 50;
  let currentY = 100;

  noteElements.forEach((noteEl, index) => {
    const restEl = noteEl.querySelector('rest');
    if (restEl) return;

    const pitchEl = noteEl.querySelector('pitch');
    if (!pitchEl) return;

    const stepEl = pitchEl.querySelector('step');
    const octaveEl = pitchEl.querySelector('octave');

    if (stepEl && octaveEl) {
      const step = stepEl.textContent || 'C';
      const octave = parseInt(octaveEl.textContent || '4', 10);
      const pitch = stepToPitch(step);

      notes.push({
        pitch,
        octave,
        x: currentX + index * 30,
        y: currentY,
      });
    }
  });

  return notes;
}

export function generateSampleMusicXML(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1">
      <part-name>Music</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key>
          <fifths>0</fifths>
        </key>
        <time>
          <beats>4</beats>
          <beat-type>4</beat-type>
        </time>
        <clef>
          <sign>G</sign>
          <line>2</line>
        </clef>
      </attributes>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>1</duration>
        <type>quarter</type>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>1</duration>
        <type>quarter</type>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>1</duration>
        <type>quarter</type>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <octave>4</octave>
        </pitch>
        <duration>1</duration>
        <type>quarter</type>
      </note>
    </measure>
    <measure number="2">
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>1</duration>
        <type>quarter</type>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>1</duration>
        <type>quarter</type>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>1</duration>
        <type>quarter</type>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>5</octave>
        </pitch>
        <duration>1</duration>
        <type>quarter</type>
      </note>
    </measure>
  </part>
</score-partwise>`;
}

export function generateScaleMusicXML(startOctave: number = 3, endOctave: number = 5): string {
  const pitches: PitchClass[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  let measures = '';
  let measureNum = 1;
  let noteCount = 0;

  for (let octave = startOctave; octave <= endOctave; octave++) {
    for (const pitch of pitches) {
      if (noteCount % 4 === 0) {
        if (noteCount > 0) {
          measures += '</measure>\n';
        }
        measures += `<measure number="${measureNum}">\n`;
        if (measureNum === 1) {
          measures += `
      <attributes>
        <divisions>1</divisions>
        <key>
          <fifths>0</fifths>
        </key>
        <time>
          <beats>4</beats>
          <beat-type>4</beat-type>
        </time>
        <clef>
          <sign>G</sign>
          <line>2</line>
        </clef>
      </attributes>`;
        }
        measureNum++;
      }

      measures += `
      <note>
        <pitch>
          <step>${pitch}</step>
          <octave>${octave}</octave>
        </pitch>
        <duration>1</duration>
        <type>quarter</type>
      </note>`;
      noteCount++;
    }
  }
  measures += '</measure>\n';

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1">
      <part-name>Color Scale Demo</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    ${measures}
  </part>
</score-partwise>`;
}
