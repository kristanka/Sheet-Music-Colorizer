# Sheet Music Colorizer

A web application that allows users to upload sheet music and visualize it with color-coded notes based on pitch class.

## Features

- **PDF Upload**: View Midi sheet music with zoom and page navigation
- **MusicXML Support**: Full support for MusicXML files with color-coded rendering
- **Pitch-to-Color Mapping**: Each pitch class gets a unique color which can be adjusted:
  - C: Red (#FF0000)
  - D: Orange (#FFA500)
  - E: Yellow (#FFFF00)
  - F: Green (#008000)
  - G: Blue (#0000FF)
  - A: Purple (#800080)
  - B: Pink (#FFC0CB)
- **Overlay Mode**: Display colored note labels over the sheet music
- **Note Head Tinting**: Color the actual note heads in the rendered score
- **Customizable Colors**: Change any pitch color via the settings panel
- **Toggle Controls**: Turn color labels and colored notes on/off independently
- **Demo Scores**: Built-in demo music to try the features

## Tech Stack

- React 19 with TypeScript
- Vite for bundling
- Tailwind CSS for styling
- PDF.js for PDF rendering
- OpenSheetMusicDisplay for MusicXML rendering
- Lucide React for icons

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Usage

1. **Upload a file**: Drag and drop or click to upload a PDF or MusicXML file
2. **Or try a demo**: Click one of the demo buttons to see the color visualization
3. **Adjust settings**: Click the settings gear icon to:
   - Toggle color labels on/off
   - Toggle colored notes on/off
   - Customize colors for each pitch

## Notes on PDF Processing

Converting scanned PDF sheet music to digital notation requires Optical Music Recognition (OMR), which is a complex process. For best results:

- Export MusicXML from notation software (MuseScore, Finale, Sibelius)
- Download MusicXML versions from IMSLP.org
- Use external OMR services like Audiveris, SmartScore, or PhotoScore

## File Structure

```
src/
├── components/
│   ├── DemoSelector.tsx     # Demo music selection
│   ├── FileUploader.tsx     # Drag & drop file upload
│   ├── MusicDisplay.tsx     # OSMD notation rendering
│   ├── PDFViewer.tsx        # PDF.js viewer
│   └── SettingsSidebar.tsx  # Settings panel
├── types/
│   └── music.ts             # TypeScript types
├── utils/
│   ├── demoMusic.ts         # Demo MusicXML generators
│   ├── musicXmlParser.ts    # MusicXML parsing
│   ├── pdfProcessor.ts      # PDF.js utilities
│   └── pitchColors.ts       # Color mapping utilities
├── App.tsx                  # Main application
└── index.css                # Global styles
```

## License

MIT
