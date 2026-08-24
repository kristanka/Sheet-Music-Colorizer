import React, { useEffect, useRef, useCallback, useState } from 'react';
import { OpenSheetMusicDisplay as OSMD, ColoringModes } from 'opensheetmusicdisplay';
import type { DisplaySettings } from '../types/music';
import {
  addPitchLabels,
  applyNotationContrast,
  applySourceNoteColors,
  removePitchLabels,
} from '../utils/osmdDecorations';
import { isDrumOnlyOsmdSheet } from '../utils/drumDetect';

interface MusicDisplayProps {
  /** MusicXML string, or a Blob for compressed .mxl (OSMD unzips Blobs itself). */
  musicXml: string | Blob;
  settings: DisplaySettings;
  /** Called after each successful load with facts read from the parsed score. */
  onScoreLoaded?: (info: { isDrumChart: boolean }) => void;
}

export const MusicDisplay: React.FC<MusicDisplayProps> = ({
  musicXml,
  settings,
  onScoreLoaded,
}) => {
  const osmdMountRef = useRef<HTMLDivElement>(null);
  /**
   * One OSMD instance for the component's lifetime, reused across loads and re-renders.
   * OSMD has no dispose API (its autoResize window listener is never removable), so
   * re-creating instances leaks a resize handler each time — reuse avoids that.
   */
  const osmdRef = useRef<OSMD | null>(null);
  /** True once the current musicXml is loaded and rendered; gates the settings effects. */
  const loadedRef = useRef(false);
  /** Latest settings for async/debounced passes — keeps callbacks stable and closures fresh. */
  const settingsRef = useRef(settings);
  const observerRef = useRef<MutationObserver | null>(null);
  const suppressObserverRef = useRef(false);
  const decorateDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const onScoreLoadedRef = useRef(onScoreLoaded);
  useEffect(() => {
    onScoreLoadedRef.current = onScoreLoaded;
  }, [onScoreLoaded]);

  /** Runs fn without the MutationObserver reacting to our own label DOM changes. */
  const withObserverSuppressed = useCallback((fn: () => void) => {
    suppressObserverRef.current = true;
    try {
      fn();
    } finally {
      observerRef.current?.takeRecords();
      suppressObserverRef.current = false;
    }
  }, []);

  /**
   * Full decoration pass: contrast dimming + in-SVG pitch labels.
   * Labels live inside the SVG, so they scale/print/export with the score —
   * no scroll or resize repositioning needed.
   */
  const decorate = useCallback(() => {
    const mount = osmdMountRef.current;
    const osmd = osmdRef.current;
    if (!mount || !osmd?.GraphicSheet) return;
    const s = settingsRef.current;
    withObserverSuppressed(() => {
      applyNotationContrast(
        mount,
        osmd,
        s.nonNoteOpacity,
        s.showColoredNotes ? s.pitchColors : undefined
      );
      removePitchLabels(mount);
      if (s.showColorLabels) addPitchLabels(osmd, s);
    });
  }, [withObserverSuppressed]);

  const scheduleDecorate = useCallback(() => {
    if (decorateDebounceRef.current) clearTimeout(decorateDebounceRef.current);
    decorateDebounceRef.current = setTimeout(() => {
      decorateDebounceRef.current = null;
      decorate();
    }, 80);
  }, [decorate]);

  // Load (or re-load) the score. Only re-runs when the source changes — settings tweaks never reload the XML.
  useEffect(() => {
    const mount = osmdMountRef.current;
    if (!mount) return;
    let cancelled = false;
    loadedRef.current = false;
    setLoadError(false);

    if (!osmdRef.current) {
      osmdRef.current = new OSMD(mount, {
        autoResize: true,
        backend: 'svg',
        drawTitle: true,
        drawSubtitle: true,
        drawComposer: true,
        drawCredits: true,
        /** false: do not draw instrument names; empty MusicXML part names still left first-system name slots. */
        drawPartNames: false,
        drawMeasureNumbers: true,
        // Always on — "colors off" paints heads black instead (see applySourceNoteColors).
        coloringEnabled: true,
        coloringMode: ColoringModes.XML,
      });
      // Extra room between systems so above/below pitch labels never collide
      // with the neighboring system (OSMD default: 5).
      osmdRef.current.EngravingRules.MinSkyBottomDistBetweenSystems = 8;
    }
    const osmd = osmdRef.current;

    (async () => {
      try {
        await osmd.load(musicXml);
        if (cancelled) return;
        applySourceNoteColors(osmd, settingsRef.current);
        await osmd.render();
        if (cancelled) return;
        loadedRef.current = true;
        decorate();
        onScoreLoadedRef.current?.({ isDrumChart: isDrumOnlyOsmdSheet(osmd) });
      } catch (err) {
        console.error('Error loading MusicXML:', err);
        if (!cancelled) setLoadError(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [musicXml, decorate]);

  // OSMD redraws its SVG on its own (autoResize on window resize, async layout).
  // A redraw wipes our contrast attributes and labels — the MutationObserver
  // catches it and re-runs the decoration pass. Mount lifetime.
  useEffect(() => {
    const mount = osmdMountRef.current;
    if (!mount) return;
    const mo = new MutationObserver(() => {
      if (suppressObserverRef.current) return;
      if (loadedRef.current) scheduleDecorate();
    });
    mo.observe(mount, { childList: true, subtree: true });
    observerRef.current = mo;
    return () => {
      mo.disconnect();
      observerRef.current = null;
      if (decorateDebounceRef.current) clearTimeout(decorateDebounceRef.current);
      loadedRef.current = false;
      osmdRef.current = null;
    };
  }, [scheduleDecorate]);

  // Palette / coloring toggle: recolor source notes and re-render — no XML reload.
  useEffect(() => {
    const osmd = osmdRef.current;
    if (!osmd || !loadedRef.current) return;
    applySourceNoteColors(osmd, settingsRef.current);
    void (async () => {
      await osmd.render();
      decorate();
    })();
  }, [settings.showColoredNotes, settings.pitchColors, settings.drumColors, decorate]);

  // Opacity slider / label toggle: decoration pass only, no re-render.
  useEffect(() => {
    if (!loadedRef.current) return;
    decorate();
  }, [settings.nonNoteOpacity, settings.showColorLabels, decorate]);

  return (
    <div
      className="osmd-outer"
      style={{
        minHeight: 300,
        position: 'relative',
        width: '100%',
        background: '#fff',
        padding: 16,
        borderRadius: 8,
        boxShadow: 'inset 0 0 0 1px #e5e5e5',
      }}
    >
      {loadError && (
        <div style={{ padding: '32px', textAlign: 'center', color: '#c62828' }}>
          <p style={{ fontWeight: 600, margin: 0 }}>Error loading music notation</p>
          <p style={{ fontSize: 14, marginTop: 8, marginBottom: 0 }}>
            The file might not be valid MusicXML format.
          </p>
        </div>
      )}
      <div
        ref={osmdMountRef}
        className="osmd-mount"
        style={{ position: 'relative', width: '100%', minHeight: 280 }}
      />
    </div>
  );
};
