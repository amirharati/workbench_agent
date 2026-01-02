import React, { RefObject } from 'react';
import { Search, X } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputRef?: RefObject<HTMLInputElement>;
}

export const SearchBar: React.FC<SearchBarProps> = ({ value, onChange, placeholder = '⌘K Search...', inputRef }) => {
  return (
    <div style={{ flex: 1, minWidth: 160, position: 'relative', maxWidth: 280 }}>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          height: 26,
          padding: '0 24px 0 28px',
          background: 'var(--input-bg)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          color: 'var(--text)',
          fontSize: 'var(--text-sm)',
          outline: 'none',
          transition: 'border-color 0.12s ease',
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-focus)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'var(--border)';
        }}
      />
      <Search
        size={13}
        style={{
          position: 'absolute',
          left: 8,
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--text-faint)',
          pointerEvents: 'none',
        }}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          style={{
            position: 'absolute',
            right: 4,
            top: '50%',
            transform: 'translateY(-50%)',
            border: 'none',
            background: 'transparent',
            color: 'var(--text-faint)',
            cursor: 'pointer',
            padding: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 2,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--text)';
            e.currentTarget.style.background = 'var(--bg-hover)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-faint)';
            e.currentTarget.style.background = 'transparent';
          }}
          title="Clear"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
};
