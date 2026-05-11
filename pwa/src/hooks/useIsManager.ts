import { useEffect, useState } from "react";
import { probeSession } from "../auth/session";

const MANAGER_ROLES = ["VT Manager", "System Manager"];

export function useIsManager(): boolean | null {
  const [isManager, setIsManager] = useState<boolean | null>(null);
  useEffect(() => {
    probeSession()
      .then((s) =>
        setIsManager(Boolean(s.roles?.some((r) => MANAGER_ROLES.includes(r)))),
      )
      .catch(() => setIsManager(false));
  }, []);
  return isManager;
}
