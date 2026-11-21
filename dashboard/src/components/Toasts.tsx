import type { Toast } from "../hooks/useToasts";
import { Icon } from "./Icon";

export function Toasts({
  toasts,
  onDismiss,
}: {
  toasts: readonly Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div aria-atomic="false" aria-live="polite" className="toast-region">
      {toasts.map((toast) => (
        <div
          className={`toast toast--${toast.tone}`}
          key={toast.id}
          role={toast.tone === "error" ? "alert" : "status"}
        >
          <Icon name={toast.tone === "error" ? "alert" : "check"} size={17} />
          <p>{toast.message}</p>
          <button
            aria-label="Dismiss notification"
            className="toast-close"
            onClick={() => onDismiss(toast.id)}
            type="button"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
