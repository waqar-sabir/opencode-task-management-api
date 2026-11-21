import type { ApiError } from "../api/error";
import { Icon } from "./Icon";

/** Render the API's stable error envelope without leaking implementation detail. */
export function ApiErrorNotice({
  error,
  onRetry,
  compact = false,
}: {
  error: ApiError;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`error-notice${compact ? " error-notice--compact" : ""}`}
      role="alert"
    >
      <span aria-hidden="true" className="error-icon">
        <Icon name="alert" size={20} />
      </span>
      <div className="error-copy">
        <p className="error-message">{error.message}</p>
        <p className="error-meta">
          <code>{error.code}</code>
          {error.status > 0 ? <span>HTTP {error.status}</span> : null}
        </p>
        {error.details.length > 0 ? (
          <ul className="error-details">
            {error.details.map((detail) => (
              <li key={`${detail.path}-${detail.message}`}>
                {detail.path ? <strong>{detail.path}: </strong> : null}
                {detail.message}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {onRetry ? (
        <button
          className="button button--quiet"
          onClick={onRetry}
          type="button"
        >
          <Icon name="refresh" size={16} />
          <span>Retry</span>
        </button>
      ) : null}
    </div>
  );
}
