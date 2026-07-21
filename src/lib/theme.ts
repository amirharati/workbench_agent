export type AppTheme = 'dark' | 'light';

export const APP_THEME_STORAGE_KEY = 'app-theme';

export function resolveAppTheme(
  stored: string | null | undefined,
  prefersDark: boolean
): AppTheme {
  if (stored === 'dark' || stored === 'light') return stored;
  return prefersDark ? 'dark' : 'light';
}

export function readAppTheme(): AppTheme {
  if (typeof window === 'undefined') return 'dark';
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(APP_THEME_STORAGE_KEY);
  } catch {
    /* localStorage may be unavailable in restricted contexts */
  }
  const prefersDark = Boolean(
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
  );
  return resolveAppTheme(stored, prefersDark);
}

export function applyAppTheme(theme: AppTheme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function saveAppTheme(theme: AppTheme): void {
  applyAppTheme(theme);
  try {
    window.localStorage.setItem(APP_THEME_STORAGE_KEY, theme);
  } catch {
    /* the current document still receives the selected theme */
  }
}
