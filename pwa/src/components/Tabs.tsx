interface Tab {
  key: string;
  label: string;
}

interface Props {
  tabs: Tab[];
  active: string;
  onChange: (key: string) => void;
}

export function Tabs({ tabs, active, onChange }: Props) {
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        marginBottom: "var(--vt-space-4)",
        borderBottom: "1px solid var(--vt-border)",
      }}
      role="tablist"
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            style={{
              padding: "10px 16px",
              background: "transparent",
              border: 0,
              borderBottom: isActive
                ? "2px solid var(--vt-primary)"
                : "2px solid transparent",
              color: isActive ? "var(--vt-primary)" : "var(--vt-text-muted)",
              fontWeight: 600,
              fontSize: 14,
              marginBottom: -1,
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
