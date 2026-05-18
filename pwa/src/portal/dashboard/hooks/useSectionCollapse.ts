const KEY = "vt_dashboard_collapsed";
type CollapseState = Record<string, boolean>;

export function getCollapseState(): CollapseState {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function toggleCollapseState(id: string): boolean {
  const state = getCollapseState();
  const next = !state[id];
  localStorage.setItem(KEY, JSON.stringify({ ...state, [id]: next }));
  return next;
}
