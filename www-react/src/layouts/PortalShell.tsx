import { Outlet } from 'react-router-dom';
import { useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { TopBar } from '@/components/TopBar';
import { CommandPalette } from '@/components/CommandPalette';
import { useShortcut } from '@/hooks/useShortcut';

export function PortalShell() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  useShortcut(['mod+k'], () => setPaletteOpen((o) => !o));

  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <TopBar onOpenPalette={() => setPaletteOpen(true)} />
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
