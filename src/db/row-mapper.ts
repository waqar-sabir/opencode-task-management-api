import type { Task, TaskStatus } from "../repositories/task-repository.js";

/** Raw row shape as returned by PostgreSQL (snake_case). */
export interface TaskRow {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly search_title: string;
  readonly search_description: string;
  readonly status: string;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
  readonly completed_at: Date | string | null;
}

function toStatus(value: string): TaskStatus {
  if (value === "todo" || value === "completed") {
    return value;
  }
  throw new Error(`Unexpected task status in storage: ${value}`);
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

/** Map a storage row to the domain object; search columns never escape. */
export function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: toStatus(row.status),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    completedAt:
      row.completed_at === null ? null : toIso(row.completed_at),
  };
}
