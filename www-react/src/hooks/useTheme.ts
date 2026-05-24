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

export function applyTheme(_theme: ThemeState['theme']) {
  document.documentElement.classList.remove('dark');
}
