export function NarrativePanel({ items }: { items: string[] }) {
  if (!items || items.length === 0) {
    return null;
  }
  return (
    <aside className="lg:w-64 card p-5 h-fit">
      <h2 className="text-[11px] uppercase tracking-[0.14em] text-slate-500 mb-3">
        Highlights
      </h2>
      <ul className="space-y-2 text-sm text-slate-700">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-brand">•</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
