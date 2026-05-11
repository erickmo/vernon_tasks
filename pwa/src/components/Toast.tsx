import { createContext, useCallback, useContext, useState, ReactNode } from "react";

interface ToastItem {
  id: number;
  msg: string;
  action?: { label: string; onClick: () => void };
}

interface Ctx {
  show: (msg: string, action?: ToastItem["action"]) => void;
}

const ToastCtx = createContext<Ctx>({ show: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const show = useCallback((msg: string, action?: ToastItem["action"]) => {
    const id = Date.now() + Math.random();
    setItems((p) => [...p, { id, msg, action }]);
    setTimeout(() => setItems((p) => p.filter((i) => i.id !== id)), 5000);
  }, []);

  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      <div
        style={{
          position: "fixed",
          bottom: "calc(var(--bottom-nav-h) + 12px + var(--safe-bottom))",
          left: 12,
          right: 12,
          display: "grid",
          gap: 8,
          zIndex: 50,
        }}
      >
        {items.map((i) => (
          <div
            key={i.id}
            style={{
              background: "var(--vt-text)",
              color: "var(--vt-bg)",
              padding: "var(--vt-space-3) var(--vt-space-4)",
              borderRadius: "var(--vt-radius)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span>{i.msg}</span>
            {i.action && (
              <button
                onClick={i.action.onClick}
                style={{ color: "var(--vt-primary)", background: "transparent", border: 0 }}
              >
                {i.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}
