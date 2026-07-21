import React, { useEffect, useState } from 'react';
import {
  APP_THEME_STORAGE_KEY,
  applyAppTheme,
  readAppTheme,
  saveAppTheme,
  type AppTheme,
} from '../lib/theme';

export const ThemeSelector: React.FC = () => {
  const [theme, setTheme] = useState<AppTheme>(() => readAppTheme());

  useEffect(() => {
    applyAppTheme(theme);
  }, [theme]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === APP_THEME_STORAGE_KEY) setTheme(readAppTheme());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const selectTheme = (next: AppTheme) => {
    setTheme(next);
    saveAppTheme(next);
  };

  return (
    <div
      role="group"
      aria-label="Color theme"
      style={{
        display: 'flex',
        gap: 6,
      }}
    >
      {(['dark', 'light'] as AppTheme[]).map((option) => {
        const selected = theme === option;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={selected}
            onClick={() => selectTheme(option)}
            style={{
              minWidth: 94,
              padding: '6px 12px',
              borderRadius: 6,
              border: selected ? '1px solid var(--accent)' : '1px solid var(--border)',
              background: selected ? 'var(--accent-weak)' : 'var(--bg)',
              color: selected ? 'var(--accent-hover)' : 'var(--text-muted)',
              fontSize: 'var(--text-sm)',
              fontWeight: selected ? 700 : 600,
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {option === 'dark' ? '◐ Dark' : '◑ Light'}
          </button>
        );
      })}
    </div>
  );
};

/** Backward-compatible name for any future compact placement. */
export const ThemeToggle = ThemeSelector;
