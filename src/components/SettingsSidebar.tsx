import React from 'react';
import { X, RotateCcw } from 'lucide-react';
import { PitchColorSwatch } from './PitchColorSwatch';
import type { DisplaySettings, PitchClass } from '../types/music';
import { DEFAULT_PITCH_COLORS } from '../types/music';

interface SettingsSidebarProps {
  settings: DisplaySettings;
  onSettingsChange: (settings: DisplaySettings) => void;
  isOpen: boolean;
  onToggle: () => void;
}

const PITCH_NAMES: { key: PitchClass; name: string }[] = [
  { key: 'C', name: 'Do' },
  { key: 'D', name: 'Re' },
  { key: 'E', name: 'Mi' },
  { key: 'F', name: 'Fa' },
  { key: 'G', name: 'Sol' },
  { key: 'A', name: 'La' },
  { key: 'B', name: 'Si' },
];

export const SettingsSidebar: React.FC<SettingsSidebarProps> = ({
  settings,
  onSettingsChange,
  isOpen,
  onToggle,
}) => {
  const updateColor = (pitch: PitchClass, color: string) => {
    onSettingsChange({
      ...settings,
      pitchColors: { ...settings.pitchColors, [pitch]: color },
    });
  };

  const resetColors = () => {
    onSettingsChange({
      ...settings,
      pitchColors: { ...DEFAULT_PITCH_COLORS },
    });
  };

  const toggleColorLabels = () => {
    onSettingsChange({ ...settings, showColorLabels: !settings.showColorLabels });
  };

  const toggleColoredNotes = () => {
    onSettingsChange({ ...settings, showColoredNotes: !settings.showColoredNotes });
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onToggle}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
          zIndex: 40,
        }}
      />

      {/* Sidebar */}
      <div style={{
        position: 'fixed',
        top: 0,
        right: 0,
        height: '100%',
        width: '320px',
        backgroundColor: '#fff',
        zIndex: 50,
        boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.1)',
        overflowY: 'auto',
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      }}>
        {/* Header */}
        <div style={{
          position: 'sticky',
          top: 0,
          backgroundColor: '#fff',
          borderBottom: '1px solid #e5e5e5',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <h2 style={{ fontWeight: 600, fontSize: '17px', color: '#1d1d1f', margin: 0 }}>Settings</h2>
          <button
            onClick={onToggle}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              border: 'none',
              backgroundColor: '#f5f5f7',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X style={{ width: '16px', height: '16px', color: '#86868b' }} />
          </button>
        </div>

        <div style={{ padding: '20px' }}>
          {/* Display Options */}
          <section style={{ marginBottom: '32px' }}>
            <h3 style={{
              fontSize: '12px',
              fontWeight: 600,
              color: '#86868b',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '12px',
            }}>
              Display Options
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px',
                backgroundColor: '#f5f5f7',
                borderRadius: '10px',
                cursor: 'pointer',
              }}>
                <span style={{ fontSize: '14px', color: '#1d1d1f' }}>Show color labels</span>
                <input
                  type="checkbox"
                  checked={settings.showColorLabels}
                  onChange={toggleColorLabels}
                  style={{ width: '18px', height: '18px', accentColor: '#0066cc' }}
                />
              </label>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px',
                backgroundColor: '#f5f5f7',
                borderRadius: '10px',
                cursor: 'pointer',
              }}>
                <span style={{ fontSize: '14px', color: '#1d1d1f' }}>Color note heads</span>
                <input
                  type="checkbox"
                  checked={settings.showColoredNotes}
                  onChange={toggleColoredNotes}
                  style={{ width: '18px', height: '18px', accentColor: '#0066cc' }}
                />
              </label>
            </div>
          </section>

          {/* Colors */}
          <section>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px',
            }}>
              <h3 style={{
                fontSize: '12px',
                fontWeight: 600,
                color: '#86868b',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                margin: 0,
              }}>
                Pitch Colors
              </h3>
              <button
                onClick={resetColors}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '12px',
                  color: '#0066cc',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <RotateCcw style={{ width: '12px', height: '12px' }} />
                Reset
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {PITCH_NAMES.map(({ key, name }) => (
                <div
                  key={key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '8px 12px',
                    backgroundColor: '#f5f5f7',
                    borderRadius: '10px',
                  }}
                >
                  <PitchColorSwatch
                    pitch={key}
                    color={settings.pitchColors[key]}
                    onColorChange={updateColor}
                    dimensions={{ width: 32, height: 32, fontSize: 14, borderRadius: 8 }}
                  />
                  <span style={{ flex: 1, fontSize: '14px', color: '#1d1d1f' }}>
                    {key} <span style={{ color: '#86868b' }}>({name})</span>
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
};
