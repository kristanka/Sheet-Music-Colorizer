import type { PitchClass } from '../types/music';

export type PitchColorSwatchDimensions = {
  width: number;
  height: number;
  fontSize: number;
  borderRadius: number;
};

type PitchColorSwatchProps = {
  pitch: PitchClass;
  color: string;
  onColorChange: (pitch: PitchClass, color: string) => void;
  dimensions: PitchColorSwatchDimensions;
};

/**
 * One pitch’s color. Clicking opens the native color picker; updates are merged into
 * the shared `DisplaySettings.pitchColors` at the app root (same as Settings sidebar).
 */
export function PitchColorSwatch({ pitch, color, onColorChange, dimensions }: PitchColorSwatchProps) {
  const { width, height, fontSize, borderRadius } = dimensions;

  return (
    <label
      style={{
        position: 'relative',
        display: 'inline-flex',
        cursor: 'pointer',
        borderRadius,
        flexShrink: 0,
      }}
      title={`${pitch} — click to change color`}
    >
      <input
        type="color"
        value={color}
        onChange={(e) => onColorChange(pitch, e.target.value)}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: 0,
          cursor: 'pointer',
          margin: 0,
          padding: 0,
          border: 'none',
        }}
        aria-label={`${pitch} pitch color`}
      />
      <div
        style={{
          width,
          height,
          borderRadius,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontWeight: 600,
          fontSize,
          backgroundColor: color,
          pointerEvents: 'none',
        }}
      >
        {pitch}
      </div>
    </label>
  );
}

export const PITCH_CLASS_ORDER: PitchClass[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
