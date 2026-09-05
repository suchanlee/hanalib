'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'hana-theme';

interface ThemeContextValue {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

function applyTheme(theme: ThemePreference, prefersDark: boolean) {
  const dark = theme === 'dark' || (theme === 'system' && prefersDark);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

function getThemeSnapshot(): ThemePreference {
  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isThemePreference(storedTheme) ? storedTheme : 'system';
}

function subscribeToTheme(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener('hana-theme-change', onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener('hana-theme-change', onChange);
  };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore<ThemePreference>(
    subscribeToTheme,
    getThemeSnapshot,
    () => 'system',
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    applyTheme(theme, media.matches);

    function syncSystemTheme(event: MediaQueryListEvent) {
      if (theme === 'system') applyTheme('system', event.matches);
    }

    media.addEventListener('change', syncSystemTheme);
    return () => media.removeEventListener('change', syncSystemTheme);
  }, [theme]);

  const setTheme = useCallback((nextTheme: ThemePreference) => {
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    applyTheme(
      nextTheme,
      window.matchMedia('(prefers-color-scheme: dark)').matches,
    );
    window.dispatchEvent(new Event('hana-theme-change'));
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}
