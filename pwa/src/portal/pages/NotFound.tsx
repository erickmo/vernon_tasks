import { Link } from "react-router-dom";
import { EmptyState } from "../../components/EmptyState";

export function NotFound() {
  return (
    <EmptyState
      title="Page not found"
      description="The page you’re looking for doesn’t exist in the portal."
      action={<Link to="/app">Go to portal home</Link>}
    />
  );
}
