import { useState, useCallback, useEffect, useMemo } from 'react';
import { AlertCircle, X, Music, Download } from 'lucide-react';
import { FileUploader } from './components/FileUploader';
import { MusicDisplay } from './components/MusicDisplay';
import { SettingsSidebar } from './components/SettingsSidebar';
import { DemoSelector } from './components/DemoSelector';
import { ColorSwatch, PitchColorSwatch } from './components/PitchColorSwatch';
import type { DisplaySettings, PitchClass } from './types/music';
import { DEFAULT_SETTINGS, PITCH_CLASS_ORDER } from './types/music';
import type { DrumFamily } from './types/drums';
import { DRUM_FAMILIES, DRUM_FAMILY_ORDER, drumFamilyColor, withDrumFamilyColor } from './types/drums';
import { isDrumOnlyMusicXml } from './utils/drumDetect';
import {
  isStandardMidiFile,
  midiFileToMusicXml,
  titleFromFileName,
} from './utils/midiToMusicXml';
import type { DemoType } from './utils/demoMusic';
import { getDemoXML } from './utils/demoMusic';
import { exportScoreToPdf } from './utils/exportSheetPdf';
import './index.css';

type ViewMode = 'upload' | 'notation';

const SETTINGS_STORAGE_KEY = 'sheet-music-colorizer:settings';

/** Restore persisted settings, merged over defaults so new fields keep working after upgrades. */
function loadStoredSettings(): DisplaySettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<DisplaySettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      pitchColors: { ...DEFAULT_SETTINGS.pitchColors, ...(parsed.pitchColors ?? {}) },
      drumColors: { ...DEFAULT_SETTINGS.drumColors, ...(parsed.drumColors ?? {}) },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('upload');
  const [settings, setSettings] = useState<DisplaySettings>(loadStoredSettings);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Storage unavailable (private mode, quota) — settings just won't persist.
    }
  }, [settings]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [musicXml, setMusicXml] = useState<string | Blob | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);

  const handleFileSelect = useCallback(async (file: File) => {
    setIsLoading(true);
    setError(null);

    try {
      const fileExtension = file.name.includes('.')
        ? file.name.split('.').pop()?.toLowerCase()
        : '';
      const mime = file.type || '';

      if (fileExtension === 'mxl') {
        // MXL is a ZIP archive — reading it as text corrupts it. OSMD unzips Blobs itself.
        setMusicXml(file);
        setFileName(file.name);
        setViewMode('notation');
      } else if (fileExtension === 'xml' || fileExtension === 'musicxml') {
        const xmlContent = await file.text();
        setMusicXml(xmlContent);
        setFileName(file.name);
        setViewMode('notation');
      } else if (
        fileExtension === 'mid' ||
        fileExtension === 'midi' ||
        mime === 'audio/midi' ||
        mime === 'audio/x-midi'
      ) {
        const ab = await file.arrayBuffer();
        setMusicXml(
          midiFileToMusicXml(ab, { title: titleFromFileName(file.name) })
        );
        setFileName(file.name);
        setViewMode('notation');
      } else {
        const ab = await file.arrayBuffer();
        if (isStandardMidiFile(ab)) {
          setMusicXml(
            midiFileToMusicXml(ab, { title: titleFromFileName(file.name) })
          );
          setFileName(file.name);
          setViewMode('notation');
        } else {
          setError('Unsupported file format. Use MusicXML, XML, MXL, or MIDI (.mid / .midi).');
        }
      }
    } catch (err) {
      console.error('Error processing file:', err);
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to process file. Please try again.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleDemoSelect = useCallback((type: DemoType) => {
    try {
      const xml = getDemoXML(type);
      setMusicXml(xml);
      setFileName(`Demo: ${type.charAt(0).toUpperCase() + type.slice(1)}`);
      setViewMode('notation');
      setError(null);
    } catch (err) {
      console.error('Error loading demo:', err);
      setError('Could not load the demo. Please try again.');
    }
  }, []);

  const handleReset = useCallback(() => {
    setViewMode('upload');
    setMusicXml(null);
    setFileName('');
    setError(null);
  }, []);

  const handleDownloadPdf = useCallback(async () => {
    if (!musicXml) return;
    setIsExporting(true);
    setError(null);
    try {
      await exportScoreToPdf(musicXml, settings, fileName);
    } catch (e) {
      console.error('Export failed:', e);
      setError(
        e instanceof Error
          ? `Could not create PDF: ${e.message}`
          : 'Could not create PDF. Try again.'
      );
    } finally {
      setIsExporting(false);
    }
  }, [musicXml, settings, fileName]);

  const handlePitchColorChange = useCallback((pitch: PitchClass, color: string) => {
    setSettings((prev) => ({
      ...prev,
      pitchColors: { ...prev.pitchColors, [pitch]: color },
    }));
  }, []);

  const handleDrumFamilyColorChange = useCallback((family: DrumFamily, color: string) => {
    setSettings((prev) => ({
      ...prev,
      drumColors: withDrumFamilyColor(prev.drumColors, family, color),
    }));
  }, []);

  /** Drum-only scores color/label by kit piece instead of pitch. (.mxl Blobs are treated as pitched.) */
  const isDrumChart = useMemo(
    () => typeof musicXml === 'string' && isDrumOnlyMusicXml(musicXml),
    [musicXml]
  );

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
      <SettingsSidebar
        settings={settings}
        onSettingsChange={setSettings}
        isOpen={settingsOpen}
        onToggle={() => setSettingsOpen(!settingsOpen)}
        isDrumChart={isDrumChart}
      />

      <header style={{ borderBottom: '1px solid #e5e5e5', backgroundColor: '#fff' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 24px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            type="button"
            onClick={handleReset}
            aria-label="Go to home"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              background: 'none',
              border: 'none',
              padding: 0,
              margin: 0,
              cursor: 'pointer',
              font: 'inherit',
              textAlign: 'left',
            }}
          >
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Music style={{ width: '20px', height: '20px', color: '#fff' }} />
            </div>
            <span style={{ fontWeight: 600, fontSize: '16px', color: '#1d1d1f' }}>Sheet Music Colorizer</span>
          </button>
          
          {viewMode !== 'upload' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span style={{ fontSize: '14px', color: '#86868b' }}>{fileName}</span>
              <button
                onClick={handleReset}
                style={{ fontSize: '14px', color: '#0066cc', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer' }}
              >
                New File
              </button>
            </div>
          )}
        </div>
      </header>

      <main>
        {error && (
          <div style={{ backgroundColor: '#fff3cd', borderBottom: '1px solid #ffc107' }}>
            <div style={{ maxWidth: '900px', margin: '0 auto', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <AlertCircle style={{ width: '16px', height: '16px', color: '#856404', flexShrink: 0 }} />
              <p style={{ fontSize: '14px', color: '#856404', flex: 1, margin: 0 }}>{error}</p>
              <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#856404' }}>
                <X style={{ width: '16px', height: '16px' }} />
              </button>
            </div>
          </div>
        )}

        {viewMode === 'upload' && (
          <div style={{ maxWidth: '700px', margin: '0 auto', padding: '60px 24px' }}>
            <div style={{ textAlign: 'center', marginBottom: '48px' }}>
              <h1 style={{ fontSize: '40px', fontWeight: 700, color: '#1d1d1f', marginBottom: '16px', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                Color-code your sheet music
              </h1>
              <p style={{ fontSize: '18px', color: '#86868b', maxWidth: '500px', margin: '0 auto', lineHeight: 1.5 }}>
                Upload MusicXML or MIDI. MIDI uses treble, bass, or a grand-staff part split at middle C so notes sit on a real staff.
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '48px' }}>
              {PITCH_CLASS_ORDER.map((p) => (
                <PitchColorSwatch
                  key={p}
                  pitch={p}
                  color={settings.pitchColors[p]}
                  onColorChange={handlePitchColorChange}
                  dimensions={{ width: 44, height: 44, fontSize: 16, borderRadius: 10 }}
                />
              ))}
            </div>

            <div style={{ marginBottom: '48px' }}>
              <FileUploader
                onFileSelect={handleFileSelect}
                acceptedTypes={['.xml', '.musicxml', '.mxl', '.mid', '.midi']}
                isLoading={isLoading}
              />
            </div>

            <div style={{ position: 'relative', marginBottom: '48px' }}>
              <div style={{ borderTop: '1px solid #e5e5e5' }}></div>
              <div style={{ position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#fff', padding: '0 16px' }}>
                <span style={{ fontSize: '14px', color: '#86868b' }}>or try a demo</span>
              </div>
            </div>

            <DemoSelector onSelectDemo={handleDemoSelect} />
          </div>
        )}

        {viewMode === 'notation' && musicXml && (
          <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {isDrumChart
                  ? DRUM_FAMILY_ORDER.map((f) => (
                      <ColorSwatch
                        key={f}
                        label={DRUM_FAMILIES[f].abbrev}
                        title={`${DRUM_FAMILIES[f].name} — click to change color`}
                        color={drumFamilyColor(f, settings.drumColors)}
                        onColorChange={(c) => handleDrumFamilyColorChange(f, c)}
                        dimensions={{ width: 28, height: 28, fontSize: 11, borderRadius: 6 }}
                      />
                    ))
                  : PITCH_CLASS_ORDER.map((p) => (
                      <PitchColorSwatch
                        key={p}
                        pitch={p}
                        color={settings.pitchColors[p]}
                        onColorChange={handlePitchColorChange}
                        dimensions={{ width: 28, height: 28, fontSize: 12, borderRadius: 6 }}
                      />
                    ))}
              </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: '#86868b' }}>
                  <span>Labels</span>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: settings.showColorLabels ? '#34c759' : '#d2d2d7' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: '#86868b' }}>
                  <span>Colors</span>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: settings.showColoredNotes ? '#34c759' : '#d2d2d7' }} />
                </div>
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={isExporting}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '10px 16px',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#1d1d1f',
                    backgroundColor: isExporting ? '#e5e5ea' : '#f5f5f7',
                    border: '1px solid #d2d2d7',
                    borderRadius: '8px',
                    cursor: isExporting ? 'wait' : 'pointer',
                  }}
                >
                  <Download style={{ width: '16px', height: '16px' }} />
                  {isExporting ? 'Exporting…' : 'Download PDF'}
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  style={{ padding: '10px 16px', fontSize: '14px', fontWeight: 500, color: '#fff', backgroundColor: '#1d1d1f', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                >
                  Settings
                </button>
              </div>
            </div>

            <div
              style={{ backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #d2d2d7', overflow: 'visible' }}
            >
              <MusicDisplay musicXml={musicXml} settings={settings} />
            </div>
          </div>
        )}
      </main>

      <footer style={{ borderTop: '1px solid #e5e5e5', marginTop: 'auto' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px', textAlign: 'center' }}>
          <p style={{ fontSize: '14px', color: '#86868b' }}>Sheet Music Colorizer — Learn notes through color</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
