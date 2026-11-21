import { useCallback, useMemo, useState } from "react";

import { completeTask, deleteTask } from "./api/client";
import { toApiError } from "./api/error";
import type {
  ListTasksParams,
  SortField,
  SortOrder,
  StatusFilter,
  Task,
} from "./api/types";
import { ApiErrorNotice } from "./components/ApiErrorNotice";
import { ConfirmDeleteDialog } from "./components/ConfirmDeleteDialog";
import { EmptyState } from "./components/EmptyState";
import { Header } from "./components/Header";
import { Pagination } from "./components/Pagination";
import { StatsCards } from "./components/StatsCards";
import { TaskFormModal } from "./components/TaskFormModal";
import { TaskList } from "./components/TaskList";
import { Toasts } from "./components/Toasts";
import { Toolbar } from "./components/Toolbar";
import { useDebouncedValue } from "./hooks/useDebouncedValue";
import { useHealth } from "./hooks/useHealth";
import { useTaskCounts } from "./hooks/useTaskCounts";
import { useTasks } from "./hooks/useTasks";
import { useToasts } from "./hooks/useToasts";
import { pluralize } from "./lib/format";

interface Filters {
  readonly q: string;
  readonly status: StatusFilter;
  readonly sort: SortField;
  readonly order: SortOrder;
  readonly page: number;
  readonly limit: number;
}

const DEFAULT_FILTERS: Filters = {
  q: "",
  status: "all",
  sort: "createdAt",
  order: "desc",
  page: 1,
  limit: 20,
};

export function App() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

  const debouncedQuery = useDebouncedValue(filters.q, 300);

  const query = useMemo<ListTasksParams>(
    () => ({
      q: debouncedQuery,
      status: filters.status,
      sort: filters.sort,
      order: filters.order,
      page: filters.page,
      limit: filters.limit,
    }),
    [
      debouncedQuery,
      filters.status,
      filters.sort,
      filters.order,
      filters.page,
      filters.limit,
    ],
  );

  const { data, loading, error, refresh } = useTasks(query);
  const {
    counts,
    loading: countsLoading,
    refresh: refreshCounts,
  } = useTaskCounts();
  const { status: healthStatus, lastChecked, recheck } = useHealth();
  const { toasts, push, dismiss } = useToasts();

  const refreshAll = useCallback(() => {
    refresh();
    refreshCounts();
    recheck();
  }, [refresh, refreshCounts, recheck]);

  const applyFilters = useCallback((patch: Partial<Filters>) => {
    setFilters((previous) => ({
      ...previous,
      ...patch,
      page: patch.page ?? 1,
    }));
  }, []);

  const handleComplete = useCallback(
    async (task: Task) => {
      setBusyIds((previous) => new Set(previous).add(task.id));
      try {
        await completeTask(task.id);
        push("success", `Completed “${task.title}”.`);
        refresh();
        refreshCounts();
      } catch (actionError) {
        push("error", toApiError(actionError).message);
      } finally {
        setBusyIds((previous) => {
          const next = new Set(previous);
          next.delete(task.id);
          return next;
        });
      }
    },
    [push, refresh, refreshCounts],
  );

  const handleDelete = useCallback(async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await deleteTask(deleting.id);
      push("success", `Deleted “${deleting.title}”.`);
      setDeleting(null);
      refresh();
      refreshCounts();
    } catch (actionError) {
      push("error", toApiError(actionError).message);
    } finally {
      setDeleteBusy(false);
    }
  }, [deleting, push, refresh, refreshCounts]);

  const handleSaved = useCallback(
    (mode: "create" | "edit") => {
      setCreating(false);
      setEditing(null);
      push("success", mode === "create" ? "Task created." : "Task updated.");
      refresh();
      refreshCounts();
    },
    [push, refresh, refreshCounts],
  );

  const clearFilters = useCallback(() => {
    setFilters((previous) => ({
      ...previous,
      q: "",
      status: "all",
      page: 1,
    }));
  }, []);

  const tasks = data?.items ?? [];
  const total = data?.total ?? 0;
  const page = data?.page ?? filters.page;
  const hasFilters = filters.q.trim() !== "" || filters.status !== "all";
  const lastPage = Math.max(1, Math.ceil(total / filters.limit));

  const showSkeletons = loading && data === null;
  const showEmptyState = !showSkeletons && tasks.length === 0 && error === null;

  const emptyState = (() => {
    if (!showEmptyState) return null;

    if (total > 0 && filters.page > 1) {
      return (
        <EmptyState
          actionLabel="Go to the last page"
          message="Tasks changed while you were browsing. The last page has the remaining results."
          onAction={() => applyFilters({ page: lastPage })}
          title="This page is empty"
        />
      );
    }

    if (hasFilters) {
      return (
        <EmptyState
          actionLabel="Clear search and filters"
          message="Try a different search term, or switch back to all tasks."
          onAction={clearFilters}
          title="No matching tasks"
        />
      );
    }

    return (
      <EmptyState
        actionLabel="Create your first task"
        message="Add a title and an optional description. Tasks are stored in your local SQLite database."
        onAction={() => setCreating(true)}
        title="Nothing on the list yet"
      />
    );
  })();

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to tasks
      </a>

      <Header
        health={healthStatus}
        lastChecked={lastChecked}
        onNewTask={() => setCreating(true)}
        onRecheck={recheck}
        onRefresh={refreshAll}
        refreshing={loading || countsLoading}
      />

      <main className="shell" id="main">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Task Management API</p>
            <h1>Your tasks, at a glance</h1>
            <p className="page-subtitle">
              Create, search, filter, complete, and clean up the same task list
              the API exposes.
            </p>
          </div>
          <p className="page-count" aria-live="polite">
            {data ? pluralize(total, "matching task") : "Loading tasks…"}
          </p>
        </div>

        <StatsCards
          activeStatus={filters.status}
          counts={counts}
          loading={countsLoading}
          onSelectStatus={(status) => applyFilters({ status })}
        />

        <section aria-labelledby="task-panel-title" className="panel">
          <div className="panel-heading">
            <div>
              <h2 id="task-panel-title">Task list</h2>
              <p>
                {hasFilters
                  ? "Filtered view. Search matches titles and descriptions."
                  : "Newest first by default. Completed tasks stay visible."}
              </p>
            </div>
            {data ? (
              <span className="panel-total">{pluralize(total, "result")}</span>
            ) : null}
          </div>

          <Toolbar
            counts={counts}
            limit={filters.limit}
            onLimitChange={(limit) => applyFilters({ limit })}
            onOrderToggle={() =>
              applyFilters({
                order: filters.order === "desc" ? "asc" : "desc",
              })
            }
            onQueryChange={(q) => applyFilters({ q })}
            onSortChange={(sort) => applyFilters({ sort })}
            onStatusChange={(status) => applyFilters({ status })}
            order={filters.order}
            q={filters.q}
            sort={filters.sort}
            status={filters.status}
          />

          {error ? <ApiErrorNotice error={error} onRetry={refreshAll} /> : null}

          {emptyState}

          {showSkeletons ? (
            <TaskList
              busyIds={busyIds}
              loading
              onComplete={handleComplete}
              onDelete={setDeleting}
              onEdit={setEditing}
              tasks={[]}
            />
          ) : tasks.length > 0 ? (
            <TaskList
              busyIds={busyIds}
              loading={loading}
              onComplete={handleComplete}
              onDelete={setDeleting}
              onEdit={setEditing}
              tasks={tasks}
            />
          ) : null}

          {data && (tasks.length > 0 || error !== null) ? (
            <Pagination
              limit={filters.limit}
              loading={loading}
              onPageChange={(nextPage) => applyFilters({ page: nextPage })}
              page={page}
              total={total}
            />
          ) : null}
        </section>

        <footer className="app-footer">
          <p>
            Connected to the local Task Management API. Data lives in your
            SQLite file — nothing leaves this machine.
          </p>
        </footer>
      </main>

      {creating ? (
        <TaskFormModal
          key="create-task"
          mode="create"
          onClose={() => setCreating(false)}
          onSaved={handleSaved}
        />
      ) : null}

      {editing ? (
        <TaskFormModal
          key={editing.id}
          mode="edit"
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
          task={editing}
        />
      ) : null}

      {deleting ? (
        <ConfirmDeleteDialog
          busy={deleteBusy}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void handleDelete()}
          taskTitle={deleting.title}
        />
      ) : null}

      <Toasts onDismiss={dismiss} toasts={toasts} />
    </div>
  );
}
