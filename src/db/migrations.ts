import type { DatabaseSync } from "node:sqlite";

export interface Migration {
  readonly version: number;
  readonly sql: string;
}

/**
 * Forward-only migrations. Version 1 creates the task table and its indexes
 * exactly as specified in ARCHITECTURE.md §7.1.
 */
export const migrations: readonly Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE tasks (
        id           TEXT PRIMARY KEY,
        title        TEXT NOT NULL
                     CHECK (length(trim(title)) > 0 AND length(title) <= 200),
        description  TEXT NOT NULL DEFAULT ''
                     CHECK (length(description) <= 2000),
        search_text  TEXT NOT NULL,
        status       TEXT NOT NULL DEFAULT 'todo'
                     CHECK (status IN ('todo', 'completed')),
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL,
        completed_at TEXT,
        CHECK ((status = 'completed') = (completed_at IS NOT NULL))
      );

      CREATE INDEX idx_tasks_created_at
        ON tasks (created_at DESC, id DESC);

      CREATE INDEX idx_tasks_status_created_at
        ON tasks (status, created_at DESC, id DESC);
    `,
  },
];

export function getSchemaVersion(database: DatabaseSync): number {
  const row = database.prepare("PRAGMA user_version").get() as
    { user_version: number } | undefined;
  return row?.user_version ?? 0;
}

/**
 * Apply pending migrations. Each migration and its version bump run in one
 * `BEGIN IMMEDIATE` transaction, so a failure leaves the schema untouched.
 */
export function migrate(database: DatabaseSync): number {
  const latestVersion = migrations.at(-1)?.version ?? 0;
  const currentVersion = getSchemaVersion(database);

  if (currentVersion > latestVersion) {
    throw new Error(
      `Database schema version ${currentVersion} is newer than this build supports (${latestVersion}).`,
    );
  }

  for (const migration of migrations) {
    if (migration.version <= currentVersion) {
      continue;
    }

    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(migration.sql);
      database.exec(`PRAGMA user_version = ${migration.version}`);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  return latestVersion;
}
