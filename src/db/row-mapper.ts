import type { Task, TaskStatus } from "../repositories/task-repository.js";

/** Raw row shape as returned by SQLite (snake_case, plus `search_text`). */
export interface TaskRow {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly search_text: string;
  readonly status: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly completed_at: string | null;
}

function toStatus(value: string): TaskStatus {
  if (value === "todo" || value === "completed") {
    return value;
  }
  throw new Error(`Unexpected task status in storage: ${value}`);
}

/** Map a storage row to the domain object; `search_text` never escapes. */
export function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: toStatus(row.status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}
