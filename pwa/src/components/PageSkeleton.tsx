export function PageSkeleton() {
  return (
    <div className="page-skeleton" aria-busy="true" aria-live="polite">
      <div className="page-skeleton__bar" />
      <div className="page-skeleton__bar" />
      <div className="page-skeleton__bar page-skeleton__bar--short" />
    </div>
  );
}
