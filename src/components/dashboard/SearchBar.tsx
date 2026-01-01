import React, { RefObject } from 'react';
import { Input } from '../../styles/primitives';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputRef?: RefObject<HTMLInputElement>;
}

export const SearchBar: React.FC<SearchBarProps> = ({ value, onChange, placeholder = 'Search...', inputRef }) => {
  return (
    <div style={{ flex: 1, minWidth: 220, position: 'relative', maxWidth: 360 }}>
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          padding: '0.45rem 0.75rem 0.45rem 2rem',
        }}
      />
      <span
        style={{
          position: 'absolute',
          left: 8,
          top: '50%',
          transform: 'translateY(-50%)',
          color: '#9ca3af',
          fontSize: '0.9rem',
        }}
      >
        🔍
      </span>
      {value && (
        <button
          onClick={() => onChange('')}
          style={{
            position: 'absolute',
            right: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            border: 'none',
            background: 'transparent',
            color: '#9ca3af',
            cursor: 'pointer',
          }}
          title="Clear"
        >
          ×
        </button>
      )}
    </div>
  );
};


