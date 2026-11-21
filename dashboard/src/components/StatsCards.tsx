import type { StatusFilter, TaskCounts } from "../api/types";
import { completionRate } from "../lib/format";
import { Icon } from "./Icon";

export function StatsCards({
  counts,
  loading,
  activeStatus,
  onSelectStatus,
}: {
  counts: TaskCounts | null;
  loading: boolean;
  activeStatus: StatusFilter;
  onSelectStatus: (status: StatusFilter) => void;
}) {
  const todo = counts?.todo ?? 0;
  const completed = counts?.completed ?? 0;
  const rate = completionRate(todo, completed);

  return (
    <section aria-label="Task summary" className="stats-grid">
      <button
        aria-pressed={activeStatus === "all"}
        className="stat-card stat-card--total"
        onClick={() => onSelectStatus("all")}
        type="button"
      >
        <span className="stat-icon">
          <Icon name="clipboard" size={20} />
        </span>
        <span className="stat-label">All tasks</span>
        <span
          className={`stat-value${loading && !counts ? " is-loading" : ""}`}
        >
          {counts ? counts.total : "—"}
        </span>
        <span className="stat-hint">Everything in the list</span>
      </button>

      <button
        aria-pressed={activeStatus === "todo"}
        className="stat-card stat-card--todo"
        onClick={() => onSelectStatus("todo")}
        type="button"
      >
        <span className="stat-icon">
          <Icon name="circle" size={20} />
        </span>
        <span className="stat-label">To do</span>
        <span
          className={`stat-value${loading && !counts ? " is-loading" : ""}`}
        >
          {counts ? counts.todo : "—"}
        </span>
        <span className="stat-hint">Still open</span>
      </button>

      <button
        aria-pressed={activeStatus === "completed"}
        className="stat-card stat-card--done"
        onClick={() => onSelectStatus("completed")}
        type="button"
      >
        <span className="stat-icon">
          <Icon name="check" size={20} />
        </span>
        <span className="stat-label">Completed</span>
        <span
          className={`stat-value${loading && !counts ? " is-loading" : ""}`}
        >
          {counts ? counts.completed : "—"}
        </span>
        <span className="stat-hint">Done and dusted</span>
      </button>

      <div className="stat-card stat-card--rate">
        <span className="stat-icon">
          <Icon name="trend" size={20} />
        </span>
        <span className="stat-label">Completion</span>
        <span
          className={`stat-value${loading && !counts ? " is-loading" : ""}`}
        >
          {counts ? `${rate}%` : "—"}
        </span>
        <span
          aria-hidden="true"
          className="progress-track"
          title={counts ? `${rate}% complete` : undefined}
        >
          <span className="progress-fill" style={{ width: `${rate}%` }} />
        </span>
        <span className="stat-hint">
          {counts ? `${completed} of ${counts.total}` : "No data yet"}
        </span>
      </div>
    </section>
  );
}
