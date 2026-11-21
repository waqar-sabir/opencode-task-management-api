import type { Task } from "../api/types";
import { TaskRow } from "./TaskRow";

const SKELETON_ROWS = 4;

export function TaskList({
  tasks,
  loading,
  busyIds,
  onComplete,
  onEdit,
  onDelete,
}: {
  tasks: readonly Task[];
  loading: boolean;
  busyIds: ReadonlySet<string>;
  onComplete: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}) {
  if (loading && tasks.length === 0) {
    return (
      <ul aria-busy="true" aria-label="Loading tasks" className="task-list">
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <li
            aria-hidden="true"
            className="task-card task-card--skeleton"
            key={index}
          >
            <span className="skeleton skeleton--circle" />
            <span className="skeleton-lines">
              <span className="skeleton skeleton--title" />
              <span className="skeleton skeleton--text" />
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul
      aria-busy={loading}
      aria-label="Tasks"
      className={`task-list${loading ? " is-refreshing" : ""}`}
    >
      {tasks.map((task) => (
        <TaskRow
          busy={busyIds.has(task.id)}
          key={task.id}
          onComplete={onComplete}
          onDelete={onDelete}
          onEdit={onEdit}
          task={task}
        />
      ))}
    </ul>
  );
}
