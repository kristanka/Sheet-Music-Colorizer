# Sheet Music Colorizer

A web app for people who can't (yet) read sheet music: load a score and every
note head is colored by pitch and labeled with its letter, so you can follow
the music without memorizing the staff first.

## Features

- **MusicXML support**: `.xml`, `.musicxml`, and compressed `.mxl` files
- **MIDI import (best effort)**: simple `.mid` / `.midi` files are converted to
  notation with a treble, bass, or grand-staff layout split at middle C
- **Drum charts**: drum-only MIDI files render as a percussion-clef chart with
  conventional staff positions and note-head shapes (x for hi-hat, diamond for
  ride bell, …), colored per kit family and labeled with piece abbreviations
  (K, S, HH, …)
- **Pitch-to-color mapping**: each pitch class (C–B) gets a color, editable via
  the swatches in the header or the settings panel; drum charts get one color
  per kit family (kick, snare, hi-hat, cymbals, toms, percussion)
- **Note labels**: letter (or drum-piece) labels rendered into the score —
  above the staff for treble, below for bass, beside the heads for chords
- **Contrast dimming**: staff lines, clefs, and other symbols dim to an
  adjustable opacity so the colored notes stand out
- **Vector PDF export**: A4 pages laid out by the notation engine, exported as
  crisp vector PDF (not screenshots)
- **Demo scores**: built-in demos to try everything without a file
- Settings persist in your browser between sessions

## Tech stack

- React 19 + TypeScript, built with Vite
- [OpenSheetMusicDisplay](https://opensheetmusicdisplay.org/) (VexFlow) for
  notation rendering
- jsPDF + svg2pdf.js for vector PDF export
- Lucide React for icons

## Getting started

```bash
npm install      # install dependencies
npm run dev      # start development server
npm run build    # type-check and build for production
npm run lint     # eslint
npm run preview  # preview production build
```

## Usage

1. **Upload a file** (drag & drop or click): MusicXML, MXL, or MIDI
2. **Or try a demo** from the landing page
3. **Adjust settings**: toggle labels and colored note heads, tune the
   staff-opacity slider, and customize colors per pitch class or drum family
4. **Download PDF** to get a printable A4 vector export

## File structure

```
src/
├── components/
│   ├── DemoSelector.tsx      # demo music selection
│   ├── FileUploader.tsx      # drag & drop file upload
│   ├── MusicDisplay.tsx      # OSMD lifecycle + decoration orchestration
│   ├── PitchColorSwatch.tsx  # color swatch (pitch classes & drum families)
│   └── SettingsSidebar.tsx   # settings panel
├── types/
│   ├── music.ts              # display settings, pitch colors
│   └── drums.ts              # drum-kit taxonomy, GM map, families
├── utils/
│   ├── demoMusic.ts          # built-in demo MusicXML
│   ├── midiToMusicXml.ts     # SMF parser + MusicXML / drum-chart emitters
│   ├── drumDetect.ts         # drum-chart detection, OSMD note → kit piece
│   ├── osmdDecorations.ts    # note coloring, contrast dimming, in-SVG labels
│   ├── exportSheetPdf.ts     # OSMD A4 layout → vector PDF
│   ├── chordRecognition.ts   # chord naming (used for pitch utilities)
│   ├── osmdPitch.ts          # OSMD pitch-enum helpers
│   └── pitchColors.ts        # color mapping utilities
├── App.tsx                   # main application
└── index.css                 # global styles
```

## Known limitations

- MIDI import is intentionally simple: no tuplets, ties, key signatures, or
  multi-voice separation — complex piano MIDI will render imperfectly.
  MusicXML is the first-class input format.
- Mixed pitched + drum MIDI files keep the pitched parts and drop the drum
  track (drum charts are supported for drum-only files).
- Labels show the natural letter only; accidental-aware labels (C♯, B♭) are
  planned.

## License

MIT
