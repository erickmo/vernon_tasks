import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '@/features/auth/useSession';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useSession();
  const loc = useLocation();
  if (isLoading) return <div className="p-8 text-sm text-slate-500">Loading…</div>;
  if (isError || !data) {
    return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  }
  return <>{children}</>;
}
