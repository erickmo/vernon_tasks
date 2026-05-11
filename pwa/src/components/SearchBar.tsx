import { t } from "../i18n";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onOpenFilter: () => void;
  filterActive: boolean;
}

export function SearchBar({ value, onChange, onOpenFilter, filterActive }: Props) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        marginBottom: "var(--vt-space-3)",
      }}
    >
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("search.placeholder")}
        aria-label={t("search.placeholder")}
        style={{
          flex: 1,
          padding: "10px 12px",
          borderRadius: "var(--vt-radius)",
          border: "1px solid var(--vt-border)",
          background: "var(--vt-surface)",
          color: "var(--vt-text)",
        }}
      />
      <button
        onClick={onOpenFilter}
        aria-label={t("filter.button")}
        style={{
          padding: "10px 14px",
          borderRadius: "var(--vt-radius)",
          border: "1px solid var(--vt-border)",
          background: filterActive ? "var(--vt-primary)" : "var(--vt-surface)",
          color: filterActive ? "var(--vt-primary-contrast)" : "var(--vt-text)",
          fontWeight: 600,
        }}
      >
        {t("filter.button")}
      </button>
    </div>
  );
}
