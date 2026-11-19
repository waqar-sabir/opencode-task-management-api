import type { DatabaseSync } from "node:sqlite";

import type {
  CreateTaskRecord,
  SortOrder,
  Task,
  TaskContentPatch,
  TaskListQuery,
  TaskPage,
  TaskRepository,
  TaskSortField,
} from "../repositories/task-repository.js";
import { toTask, type TaskRow } from "./row-mapper.js";

const SORT_COLUMNS: Record<TaskSortField, string> = {
  createdAt: "created_at",
  updatedAt: "updated_at",
  title: "title COLLATE NOCASE",
};

const DIRECTIONS: Record<SortOrder, "ASC" | "DESC"> = {
  asc: "ASC",
  desc: "DESC",
};

/** Normalize both stored text and query terms so case pairs match. */
export function normalizeForSearch(value: string): string {
  return value.normalize("NFC").toLowerCase();
}

export function makeSearchText(title: string, description: string): string {
  return normalizeForSearch(`${title}\n${description}`);
}

/** Escape LIKE metacharacters so `%`, `_`, and `\` match literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export class SqliteTaskRepository implements TaskRepository {
  constructor(private readonly database: DatabaseSync) {}

  async create(input: CreateTaskRecord): Promise<Task> {
    const row = this.database
      .prepare(
        `
        INSERT INTO tasks
          (id, title, description, search_text, status, created_at, updated_at, completed_at)
        VALUES (?, ?, ?, ?, 'todo', ?, ?, NULL)
        RETURNING *
      `,
      )
      .get(
        input.id,
        input.title,
        input.description,
        makeSearchText(input.title, input.description),
        input.createdAt,
        input.updatedAt,
      ) as unknown as TaskRow;

    return toTask(row);
  }

  async findById(id: string): Promise<Task | null> {
    const row = this.database
      .prepare("SELECT * FROM tasks WHERE id = ?")
      .get(id) as unknown as TaskRow | undefined;

    return row ? toTask(row) : null;
  }

  async list(query: TaskListQuery): Promise<TaskPage> {
    const clauses: string[] = [];
    const parameters: (string | number)[] = [];

    if (query.status) {
      clauses.push("status = ?");
      parameters.push(query.status);
    }

    const term = query.q?.trim() ?? "";
    if (term.length > 0) {
      clauses.push("search_text LIKE ? ESCAPE '\\'");
      parameters.push(`%${escapeLike(normalizeForSearch(term))}%`);
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

    const totalRow = this.database
      .prepare(`SELECT COUNT(*) AS total FROM tasks ${whereSql}`)
      .get(...parameters) as unknown as { total: number };

    const sortColumn = SORT_COLUMNS[query.sort];
    const direction = DIRECTIONS[query.order];

    const rows = this.database
      .prepare(
        `
        SELECT * FROM tasks
        ${whereSql}
        ORDER BY ${sortColumn} ${direction}, id ${direction}
        LIMIT ? OFFSET ?
      `,
      )
      .all(
        ...parameters,
        query.limit,
        (query.page - 1) * query.limit,
      ) as unknown as TaskRow[];

    return { items: rows.map(toTask), total: totalRow.total };
  }

  async updateContent(
    id: string,
    patch: TaskContentPatch,
    now: string,
  ): Promise<Task | null> {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const current = this.database
        .prepare("SELECT * FROM tasks WHERE id = ?")
        .get(id) as unknown as TaskRow | undefined;

      if (!current) {
        this.database.exec("COMMIT");
        return null;
      }

      const title = patch.title ?? current.title;
      const description = patch.description ?? current.description;

      const row = this.database
        .prepare(
          `
          UPDATE tasks
          SET title = ?, description = ?, search_text = ?, updated_at = ?
          WHERE id = ?
          RETURNING *
        `,
        )
        .get(
          title,
          description,
          makeSearchText(title, description),
          now,
          id,
        ) as unknown as TaskRow;

      this.database.exec("COMMIT");
      return toTask(row);
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    const result = this.database
      .prepare("DELETE FROM tasks WHERE id = ?")
      .run(id);

    return Number(result.changes) === 1;
  }

  async complete(id: string, completedAt: string): Promise<Task | null> {
    const row = this.database
      .prepare(
        `
        UPDATE tasks
        SET status = 'completed',
            completed_at = COALESCE(completed_at, ?),
            updated_at = CASE WHEN status = 'todo' THEN ? ELSE updated_at END
        WHERE id = ?
        RETURNING *
      `,
      )
      .get(completedAt, completedAt, id) as unknown as TaskRow | undefined;

    return row ? toTask(row) : null;
  }
}
