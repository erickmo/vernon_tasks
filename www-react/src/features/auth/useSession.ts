import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchSession } from './loginApi';

export const SESSION_KEY = ['session'] as const;

export function useSession() {
  return useQuery({
    queryKey: SESSION_KEY,
    queryFn: fetchSession,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useInvalidateSession() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: SESSION_KEY });
}
