import type {
  SortField,
  SortOrder,
  StatusFilter,
  TaskCounts,
} from "../api/types";
import { Icon } from "./Icon";

const STATUS_OPTIONS: readonly { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "todo", label: "To do" },
  { value: "completed", label: "Completed" },
];

export function Toolbar({
  q,
  status,
  sort,
  order,
  limit,
  counts,
  onQueryChange,
  onStatusChange,
  onSortChange,
  onOrderToggle,
  onLimitChange,
}: {
  q: string;
  status: StatusFilter;
  sort: SortField;
  order: SortOrder;
  limit: number;
  counts: TaskCounts | null;
  onQueryChange: (value: string) => void;
  onStatusChange: (status: StatusFilter) => void;
  onSortChange: (sort: SortField) => void;
  onOrderToggle: () => void;
  onLimitChange: (limit: number) => void;
}) {
  const countFor = (value: StatusFilter) => {
    if (!counts) return null;
    if (value === "todo") return counts.todo;
    if (value === "completed") return counts.completed;
    return counts.total;
  };

  return (
    <div className="toolbar">
      <div className="search-field">
        <label className="sr-only" htmlFor="task-search">
          Search tasks
        </label>
        <Icon className="search-icon" name="search" size={18} />
        <input
          autoComplete="off"
          id="task-search"
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search titles and descriptions…"
          type="search"
          value={q}
        />
        {q ? (
          <button
            aria-label="Clear search"
            className="search-clear"
            onClick={() => onQueryChange("")}
            type="button"
          >
            <Icon name="close" size={15} />
          </button>
        ) : null}
      </div>

      <div aria-label="Filter by status" className="segmented" role="group">
        {STATUS_OPTIONS.map((option) => {
          const count = countFor(option.value);
          return (
            <button
              aria-pressed={status === option.value}
              className="segmented-button"
              key={option.value}
              onClick={() => onStatusChange(option.value)}
              type="button"
            >
              {option.label}
              {count !== null ? (
                <span className="segmented-count">{count}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="toolbar-selects">
        <label className="select-field">
          <span className="sr-only">Sort tasks by</span>
          <select
            aria-label="Sort tasks by"
            onChange={(event) => onSortChange(event.target.value as SortField)}
            value={sort}
          >
            <option value="createdAt">Created</option>
            <option value="updatedAt">Updated</option>
            <option value="title">Title</option>
          </select>
        </label>

        <button
          aria-label={`Sort ${order === "desc" ? "descending" : "ascending"}. Switch to ${order === "desc" ? "ascending" : "descending"}.`}
          className="button button--quiet order-button"
          onClick={onOrderToggle}
          title={`Currently ${order === "desc" ? "descending" : "ascending"}`}
          type="button"
        >
          <Icon name="sort" size={16} />
          <span>{order === "desc" ? "Desc" : "Asc"}</span>
        </button>

        <label className="select-field">
          <span className="sr-only">Tasks per page</span>
          <select
            aria-label="Tasks per page"
            onChange={(event) => onLimitChange(Number(event.target.value))}
            value={limit}
          >
            {[10, 20, 50, 100].map((value) => (
              <option key={value} value={value}>
                {value} / page
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
