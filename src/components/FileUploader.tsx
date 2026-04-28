import React, { useCallback, useState } from 'react';
import { Upload } from 'lucide-react';

interface FileUploaderProps {
  onFileSelect: (file: File) => void;
  acceptedTypes: string[];
  isLoading?: boolean;
}

export const FileUploader: React.FC<FileUploaderProps> = ({
  onFileSelect,
  acceptedTypes,
  isLoading = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) {
        onFileSelect(file);
      }
    },
    [onFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        onFileSelect(file);
      }
    },
    [onFileSelect]
  );

  const containerStyle: React.CSSProperties = {
    position: 'relative',
    borderRadius: '16px',
    padding: '48px 24px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s',
    border: '2px dashed',
    borderColor: isDragging ? '#0066cc' : '#d2d2d7',
    backgroundColor: isDragging ? '#f0f7ff' : '#f5f5f7',
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      style={containerStyle}
    >
      <input
        type="file"
        accept={[...acceptedTypes, 'audio/midi', 'audio/x-midi'].join(',')}
        onChange={handleFileInput}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
        disabled={isLoading}
      />

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '3px solid #d2d2d7',
            borderTopColor: '#1d1d1f',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }} />
          <p style={{ color: '#86868b', fontSize: '16px' }}>Processing file...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px',
            backgroundColor: isDragging ? '#0066cc' : '#e5e5e5',
            transition: 'background-color 0.2s',
          }}>
            <Upload style={{ width: '24px', height: '24px', color: isDragging ? '#fff' : '#86868b' }} />
          </div>
          <p style={{ color: '#1d1d1f', fontWeight: 600, fontSize: '16px', marginBottom: '4px' }}>
            Drop your file here
          </p>
          <p style={{ color: '#86868b', fontSize: '14px', marginBottom: '16px' }}>
            or click to browse
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            {['MusicXML', 'MIDI', 'XML'].map((format) => (
              <span
                key={format}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#fff',
                  border: '1px solid #d2d2d7',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: '#86868b',
                }}
              >
                {format}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
