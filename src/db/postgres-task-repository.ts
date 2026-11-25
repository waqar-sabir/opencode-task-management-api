import type { Pool } from "pg";

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
import { withTransaction } from "./transactions.js";

const SORT_COLUMNS: Record<TaskSortField, string> = {
  createdAt: "created_at",
  updatedAt: "updated_at",
  title: "lower(title)",
};

const DIRECTIONS: Record<SortOrder, "ASC" | "DESC"> = {
  asc: "ASC",
  desc: "DESC",
};

/** Normalize both stored text and query terms so case pairs match. */
export function normalizeForSearch(value: string): string {
  return value.normalize("NFC").toLowerCase();
}

/** Escape LIKE metacharacters so `%`, `_`, and `\` match literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export class PostgresTaskRepository implements TaskRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: CreateTaskRecord): Promise<Task> {
    const result = await this.pool.query<TaskRow>(
      `
      INSERT INTO tasks
        (id, title, description, search_title, search_description,
         status, created_at, updated_at, completed_at)
      VALUES ($1, $2, $3, $4, $5, 'todo', $6, $7, NULL)
      RETURNING *
    `,
      [
        input.id,
        input.title,
        input.description,
        normalizeForSearch(input.title),
        normalizeForSearch(input.description),
        input.createdAt,
        input.updatedAt,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Task insert returned no row");
    }
    return toTask(row);
  }

  async findById(id: string): Promise<Task | null> {
    const result = await this.pool.query<TaskRow>(
      "SELECT * FROM tasks WHERE id = $1",
      [id],
    );
    const row = result.rows[0];
    return row ? toTask(row) : null;
  }

  async list(query: TaskListQuery): Promise<TaskPage> {
    const clauses: string[] = [];
    const parameters: (string | number)[] = [];

    if (query.status) {
      parameters.push(query.status);
      clauses.push(`status = $${parameters.length}`);
    }

    const term = query.q?.trim() ?? "";
    if (term.length > 0) {
      parameters.push(`%${escapeLike(normalizeForSearch(term))}%`);
      const index = parameters.length;
      clauses.push(
        `(search_title LIKE $${index} ESCAPE '\\' OR search_description LIKE $${index} ESCAPE '\\')`,
      );
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

    const totalResult = await this.pool.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM tasks ${whereSql}`,
      parameters,
    );

    const sortColumn = SORT_COLUMNS[query.sort];
    const direction = DIRECTIONS[query.order];

    parameters.push(query.limit, (query.page - 1) * query.limit);
    const limitIndex = parameters.length - 1;
    const offsetIndex = parameters.length;

    const rowsResult = await this.pool.query<TaskRow>(
      `
      SELECT * FROM tasks
      ${whereSql}
      ORDER BY ${sortColumn} ${direction}, id ${direction}
      LIMIT $${limitIndex} OFFSET $${offsetIndex}
    `,
      parameters,
    );

    return {
      items: rowsResult.rows.map(toTask),
      total: totalResult.rows[0]?.total ?? 0,
    };
  }

  async updateContent(
    id: string,
    patch: TaskContentPatch,
    now: string,
  ): Promise<Task | null> {
    return withTransaction(this.pool, async (client) => {
      const currentResult = await client.query<TaskRow>(
        "SELECT * FROM tasks WHERE id = $1 FOR UPDATE",
        [id],
      );
      const current = currentResult.rows[0];

      if (!current) {
        return null;
      }

      const title = patch.title ?? current.title;
      const description = patch.description ?? current.description;

      const updated = await client.query<TaskRow>(
        `
        UPDATE tasks
        SET title = $1,
            description = $2,
            search_title = $3,
            search_description = $4,
            updated_at = $5
        WHERE id = $6
        RETURNING *
      `,
        [
          title,
          description,
          normalizeForSearch(title),
          normalizeForSearch(description),
          now,
          id,
        ],
      );

      const row = updated.rows[0];
      return row ? toTask(row) : null;
    });
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query(
      "DELETE FROM tasks WHERE id = $1 RETURNING id",
      [id],
    );
    return (result.rowCount ?? 0) === 1;
  }

  async complete(id: string, completedAt: string): Promise<Task | null> {
    const result = await this.pool.query<TaskRow>(
      `
      UPDATE tasks
      SET status = 'completed',
          completed_at = COALESCE(completed_at, $1),
          updated_at = CASE WHEN status = 'todo' THEN $1 ELSE updated_at END
      WHERE id = $2
      RETURNING *
    `,
      [completedAt, id],
    );

    const row = result.rows[0];
    return row ? toTask(row) : null;
  }
}
