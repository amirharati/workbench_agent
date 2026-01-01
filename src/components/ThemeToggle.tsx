import React, { useEffect, useState } from 'react';

type Theme = 'dark' | 'light';

const storageKey = 'app-theme';

const getInitialTheme = (): Theme => {
  if (typeof window === 'undefined') return 'dark';
  const stored = localStorage.getItem(storageKey) as Theme | null;
  if (stored === 'dark' || stored === 'light') return stored;
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
};

export const ThemeToggle: React.FC = () => {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const initial = getInitialTheme();
    setTheme(initial);
    document.documentElement.dataset.theme = initial;
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem(storageKey, next);
  };

  return (
    <button
      onClick={toggle}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: '0.5rem',
        padding: '0.5rem 0.75rem',
        borderRadius: 10,
        border: '1px solid var(--border)',
        background: 'var(--bg-glass)',
        color: 'var(--text)',
        cursor: 'pointer',
      }}
      title="Toggle light/dark theme"
    >
      <span>{theme === 'dark' ? '🌙' : '☀️'}</span>
      <span>{theme === 'dark' ? 'Dark' : 'Light'} mode</span>
    </button>
  );
};

