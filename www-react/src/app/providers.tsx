import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ReactNode, useEffect } from 'react';
import { Toaster } from 'sonner';
import { queryClient } from '@/lib/queryClient';
import { onUnauthorized } from '@/lib/api';
import { useNavigate } from 'react-router-dom';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <UnauthorizedRedirect />
      {children}
      <Toaster richColors position="bottom-right" />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

function UnauthorizedRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    onUnauthorized(() => {
      queryClient.clear();
      navigate(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    });
  }, [navigate]);
  return null;
}
