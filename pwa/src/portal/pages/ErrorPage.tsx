import { EmptyState } from "../../components/EmptyState";

export interface ErrorPageProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorPage({ message, onRetry }: ErrorPageProps) {
  return (
    <EmptyState
      title="Something went wrong"
      description={message}
      action={onRetry ? <button type="button" onClick={onRetry}>Retry</button> : null}
    />
  );
}
