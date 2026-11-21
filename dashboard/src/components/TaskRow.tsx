import type { Task } from "../api/types";
import { formatDateTime, formatRelative } from "../lib/format";
import { Icon } from "./Icon";

export function TaskRow({
  task,
  busy,
  onComplete,
  onEdit,
  onDelete,
}: {
  task: Task;
  busy: boolean;
  onComplete: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}) {
  const isCompleted = task.status === "completed";

  return (
    <li
      aria-busy={busy}
      className={`task-card task-card--${task.status}${busy ? " is-busy" : ""}`}
    >
      {isCompleted ? (
        <span
          aria-label="Completed"
          className="task-toggle task-toggle--done"
          role="img"
          title="Completed tasks cannot be reopened"
        >
          <Icon name="check" size={16} />
        </span>
      ) : (
        <button
          aria-label={`Mark “${task.title}” complete`}
          className="task-toggle"
          disabled={busy}
          onClick={() => onComplete(task)}
          title="Mark complete"
          type="button"
        >
          {busy ? <span aria-hidden="true" className="spinner" /> : null}
          <Icon name="check" size={16} />
        </button>
      )}

      <div className="task-body">
        <h3 className="task-title">{task.title}</h3>
        {task.description ? (
          <p className="task-description" title={task.description}>
            {task.description}
          </p>
        ) : (
          <p className="task-description task-description--empty">
            No description
          </p>
        )}
        <p className="task-meta">
          <span className={`badge badge--${task.status}`}>
            {isCompleted ? "Completed" : "To do"}
          </span>
          <span title={formatDateTime(task.updatedAt)}>
            Updated{" "}
            <time dateTime={task.updatedAt}>
              {formatRelative(task.updatedAt)}
            </time>
          </span>
          {task.completedAt ? (
            <span title={formatDateTime(task.completedAt)}>
              Completed{" "}
              <time dateTime={task.completedAt}>
                {formatRelative(task.completedAt)}
              </time>
            </span>
          ) : null}
        </p>
      </div>

      <div className="task-actions">
        <button
          aria-label={`Edit “${task.title}”`}
          className="icon-button"
          disabled={busy}
          onClick={() => onEdit(task)}
          title="Edit task"
          type="button"
        >
          <Icon name="edit" size={17} />
        </button>
        <button
          aria-label={`Delete “${task.title}”`}
          className="icon-button icon-button--danger"
          disabled={busy}
          onClick={() => onDelete(task)}
          title="Delete task"
          type="button"
        >
          <Icon name="trash" size={17} />
        </button>
      </div>
    </li>
  );
}
