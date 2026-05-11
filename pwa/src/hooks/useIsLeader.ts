import { useEffect, useState } from "react";
import { probeSession } from "../auth/session";

const LEADER_ROLES = ["VT Leader", "VT Manager"];

export function useIsLeader(): boolean | null {
  const [isLeader, setIsLeader] = useState<boolean | null>(null);
  useEffect(() => {
    probeSession()
      .then((s) =>
        setIsLeader(Boolean(s.roles?.some((r) => LEADER_ROLES.includes(r)))),
      )
      .catch(() => setIsLeader(false));
  }, []);
  return isLeader;
}
