export function NarrativePanel({ items }: { items: string[] }) {
  if (!items || items.length === 0) {
    return null;
  }
  return (
    <aside className="lg:w-64 border border-slate-200 dark:border-slate-800 rounded p-4">
      <h2 className="text-xs uppercase tracking-wider text-slate-500 mb-2">
        Highlights
      </h2>
      <ul className="space-y-2 text-sm">
        {items.map((it, i) => (
          <li key={i}>• {it}</li>
        ))}
      </ul>
    </aside>
  );
}
