import { useLocation } from "react-router-dom";
import { EmptyState } from "../../components/EmptyState";

export interface PermissionDeniedProps {
  requiredPerm?: string;
}

export function PermissionDenied({ requiredPerm }: PermissionDeniedProps) {
  const loc = useLocation();
  return (
    <EmptyState
      title="Permission required"
      description={
        requiredPerm
          ? `You need '${requiredPerm}' to view this page (${loc.pathname}).`
          : `You do not have access to this page (${loc.pathname}).`
      }
      action={<button type="button">Request access</button>}
    />
  );
}
