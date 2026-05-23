import { useEffect } from 'react';

type Combo = string;
const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

function matches(e: KeyboardEvent, combo: Combo): boolean {
  const parts = combo.toLowerCase().split('+');
  const key = parts.pop()!;
  const needMod = parts.includes('mod');
  const needShift = parts.includes('shift');
  const needAlt = parts.includes('alt');
  const modOk = needMod ? (isMac ? e.metaKey : e.ctrlKey) : true;
  return (
    e.key.toLowerCase() === key &&
    modOk &&
    e.shiftKey === needShift &&
    e.altKey === needAlt
  );
}

export function useShortcut(combos: Combo[], handler: (e: KeyboardEvent) => void) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (combos.some((c) => matches(e, c))) {
        e.preventDefault();
        handler(e);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [combos, handler]);
}
