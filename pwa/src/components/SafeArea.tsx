import { ReactNode } from "react";

export function SafeArea({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        paddingTop: "calc(var(--safe-top) + var(--top-nav-total-h))",
        paddingLeft: "var(--safe-left)",
        paddingRight: "var(--safe-right)",
        paddingBottom: "calc(var(--bottom-nav-h) + var(--safe-bottom))",
        minHeight: "100dvh",
      }}
    >
      {children}
    </div>
  );
}
