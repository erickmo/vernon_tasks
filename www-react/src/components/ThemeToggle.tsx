import { useEffect } from 'react';
import { applyTheme, useTheme } from '@/hooks/useTheme';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  useEffect(() => { applyTheme(theme); }, [theme]);

  return (
    <select
      aria-label="Theme"
      value={theme}
      onChange={(e) => setTheme(e.target.value as 'light' | 'dark' | 'system')}
      className="text-xs bg-transparent border border-slate-300 dark:border-slate-700 rounded px-2 py-1"
    >
      <option value="system">System</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
  );
}
