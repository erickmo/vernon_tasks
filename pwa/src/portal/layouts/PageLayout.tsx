import type { ReactNode } from "react";

export interface PageLayoutProps {
  title: string;
  breadcrumb?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

export function PageLayout({ title, breadcrumb, actions, children }: PageLayoutProps) {
  return (
    <section className="page-layout">
      <header className="page-layout__header">
        {breadcrumb && <div className="page-layout__breadcrumb">{breadcrumb}</div>}
        <div className="page-layout__title-row">
          <h1 className="page-layout__title">{title}</h1>
          {actions && <div className="page-layout__actions">{actions}</div>}
        </div>
      </header>
      <div className="page-layout__body">{children}</div>
    </section>
  );
}
