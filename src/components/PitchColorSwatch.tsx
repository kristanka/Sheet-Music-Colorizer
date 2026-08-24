import type { PitchClass } from '../types/music';

export type ColorSwatchDimensions = {
  width: number;
  height: number;
  fontSize: number;
  borderRadius: number;
};

/** Kept under the old name for existing imports. */
export type PitchColorSwatchDimensions = ColorSwatchDimensions;

type ColorSwatchProps = {
  /** Short text shown on the swatch (pitch letter or drum-family abbreviation). */
  label: string;
  /** Tooltip; defaults to the label. */
  title?: string;
  color: string;
  onColorChange: (color: string) => void;
  dimensions: ColorSwatchDimensions;
};

/**
 * One color chip with a native color picker. Generic: used for pitch classes
 * (C–B) and drum families (K, S, HH…). Updates are merged into the shared
 * `DisplaySettings` at the app root.
 */
export function ColorSwatch({ label, title, color, onColorChange, dimensions }: ColorSwatchProps) {
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
      title={title ?? `${label} — click to change color`}
    >
      <input
        type="color"
        value={color}
        onChange={(e) => onColorChange(e.target.value)}
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
        aria-label={`${title ?? label} color`}
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
        {label}
      </div>
    </label>
  );
}

type PitchColorSwatchProps = {
  pitch: PitchClass;
  color: string;
  onColorChange: (pitch: PitchClass, color: string) => void;
  dimensions: ColorSwatchDimensions;
};

/** One pitch's color chip. */
export function PitchColorSwatch({ pitch, color, onColorChange, dimensions }: PitchColorSwatchProps) {
  return (
    <ColorSwatch
      label={pitch}
      title={`${pitch} — click to change color`}
      color={color}
      onColorChange={(c) => onColorChange(pitch, c)}
      dimensions={dimensions}
    />
  );
}
