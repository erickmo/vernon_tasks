import { useEffect, useState } from "react";
import { probeSession, type Session } from "./session";

export interface AuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: { name: string } | null;
  roles: string[];
}

/**
 * Reactive auth hook backed by probeSession(). Used by portal guards.
 */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    isLoading: true,
    isAuthenticated: false,
    user: null,
    roles: [],
  });

  useEffect(() => {
    let cancelled = false;
    probeSession()
      .then((s: Session) => {
        if (cancelled) return;
        setState({
          isLoading: false,
          isAuthenticated: Boolean(s.user),
          user: s.user ? { name: s.user } : null,
          roles: s.roles ?? [],
        });
      })
      .catch(() => {
        if (cancelled) return;
        setState({
          isLoading: false,
          isAuthenticated: false,
          user: null,
          roles: [],
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
