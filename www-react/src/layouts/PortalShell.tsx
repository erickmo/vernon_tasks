import { Outlet } from 'react-router-dom';
import { useState } from 'react';
import { Nav1 } from '@/components/Nav1';
import { Nav2 } from '@/components/Nav2';
import { CommandPalette } from '@/components/CommandPalette';
import { useShortcut } from '@/hooks/useShortcut';

export function PortalShell() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  useShortcut(['mod+k'], () => setPaletteOpen((o) => !o));

  return (
    <div className="min-h-screen flex flex-col bg-[#fafaf9] text-slate-900">
      <Nav1 />
      <Nav2 onOpenPalette={() => setPaletteOpen(true)} />
      <main className="flex-1 flex flex-col min-h-0 px-6 lg:px-8 py-8 w-full">
        <Outlet />
      </main>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
