import { pluralize } from "../lib/format";
import { Icon } from "./Icon";

export function Pagination({
  page,
  limit,
  total,
  loading,
  onPageChange,
}: {
  page: number;
  limit: number;
  total: number;
  loading: boolean;
  onPageChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(total, page * limit);

  return (
    <nav aria-label="Task pages" className="pagination">
      <p className="pagination-summary">
        {total === 0
          ? "No tasks to show"
          : `Showing ${start}–${end} of ${pluralize(total, "task")}`}
      </p>
      <div className="pagination-controls">
        <button
          aria-label="Previous page"
          className="icon-button"
          disabled={loading || page <= 1}
          onClick={() => onPageChange(page - 1)}
          type="button"
        >
          <Icon name="chevron-left" />
        </button>
        <span className="pagination-page">
          Page <strong>{page}</strong> of {pages}
        </span>
        <button
          aria-label="Next page"
          className="icon-button"
          disabled={loading || page >= pages}
          onClick={() => onPageChange(page + 1)}
          type="button"
        >
          <Icon name="chevron-right" />
        </button>
      </div>
    </nav>
  );
}
