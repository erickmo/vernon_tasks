import { Link } from 'react-router-dom';
import { parseApiError, routeForDoctype } from './errors';

type Props = {
  error: unknown;
  fallback?: string;
  className?: string;
};

export function ApiErrorMessage({ error, fallback, className }: Props) {
  const parsed = parseApiError(error, fallback);

  if (parsed.kind === 'link_exists') {
    const { linkedDoctype, linkedName } = parsed.link;
    const route = routeForDoctype(linkedDoctype, linkedName);
    return (
      <div className={className}>
        Cannot delete: still linked to {linkedDoctype}{' '}
        {route ? (
          <Link to={route} className="font-semibold underline hover:no-underline">
            {linkedName}
          </Link>
        ) : (
          <span className="font-semibold">{linkedName}</span>
        )}
        . Reassign or delete that {linkedDoctype} first.
      </div>
    );
  }

  return <div className={className}>{parsed.text}</div>;
}
