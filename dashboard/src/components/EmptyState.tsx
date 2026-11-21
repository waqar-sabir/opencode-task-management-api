import { Icon } from "./Icon";

export function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty-state">
      <span aria-hidden="true" className="empty-icon">
        <Icon name="inbox" size={28} />
      </span>
      <h3>{title}</h3>
      <p>{message}</p>
      {actionLabel && onAction ? (
        <button
          className="button button--primary"
          onClick={onAction}
          type="button"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
