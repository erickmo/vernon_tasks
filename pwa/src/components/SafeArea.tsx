import { ReactNode } from "react";

export function SafeArea({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        paddingTop: "var(--safe-top)",
        paddingLeft: "var(--safe-left)",
        paddingRight: "var(--safe-right)",
        paddingBottom: "calc(var(--bottom-nav-h) + var(--safe-bottom))",
        minHeight: "100%",
      }}
    >
      {children}
    </div>
  );
}
