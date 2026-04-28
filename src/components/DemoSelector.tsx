import React from 'react';

interface DemoSelectorProps {
  onSelectDemo: (type: 'scale' | 'melody' | 'chords' | 'twinkle') => void;
}

const demos = [
  { type: 'scale' as const, title: 'C Major Scale', description: '3 octaves, all 7 notes' },
  { type: 'melody' as const, title: 'Simple Melody', description: 'Basic melodic pattern' },
  { type: 'twinkle' as const, title: 'Twinkle Star', description: 'Classic nursery rhyme' },
  { type: 'chords' as const, title: 'Chord Progression', description: 'I-IV-V-I in C major' },
];

export const DemoSelector: React.FC<DemoSelectorProps> = ({ onSelectDemo }) => {
  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
      {demos.map((demo, index) => (
        <button
          key={demo.type}
          onClick={() => onSelectDemo(demo.type)}
          onMouseEnter={() => setHoveredIndex(index)}
          onMouseLeave={() => setHoveredIndex(null)}
          style={{
            padding: '20px',
            textAlign: 'left',
            backgroundColor: hoveredIndex === index ? '#e8e8ed' : '#f5f5f7',
            borderRadius: '12px',
            border: 'none',
            cursor: 'pointer',
            transition: 'background-color 0.2s',
          }}
        >
          <h3 style={{
            fontWeight: 600,
            fontSize: '15px',
            color: '#1d1d1f',
            marginBottom: '4px',
          }}>
            {demo.title}
          </h3>
          <p style={{
            fontSize: '13px',
            color: '#86868b',
            margin: 0,
          }}>
            {demo.description}
          </p>
        </button>
      ))}
    </div>
  );
};
