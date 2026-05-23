import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ThemeState = {
  theme: 'light' | 'dark' | 'system';
  setTheme: (t: ThemeState['theme']) => void;
};

export const useTheme = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'system',
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'vernon-theme' },
  ),
);

export function applyTheme(theme: ThemeState['theme']) {
  const resolved =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      : theme;
  document.documentElement.classList.toggle('dark', resolved === 'dark');
}
