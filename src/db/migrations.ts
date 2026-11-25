import type { Pool, PoolClient } from "pg";

export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

/**
 * Forward-only migrations. Version 1 creates the task table and its indexes in
 * PostgreSQL. Integration tables are added in a later phase.
 */
export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: "tasks",
    sql: `
      CREATE TABLE tasks (
        id                 text PRIMARY KEY,
        title              text NOT NULL
                           CHECK (char_length(btrim(title)) > 0
                                  AND char_length(title) <= 200),
        description        text NOT NULL DEFAULT ''
                           CHECK (char_length(description) <= 2000),
        search_title       text NOT NULL,
        search_description text NOT NULL,
        status             text NOT NULL DEFAULT 'todo'
                           CHECK (status IN ('todo', 'completed')),
        created_at         timestamptz NOT NULL,
        updated_at         timestamptz NOT NULL,
        completed_at       timestamptz,
        CONSTRAINT tasks_completion_consistent
          CHECK ((status = 'completed') = (completed_at IS NOT NULL))
      );

      CREATE INDEX idx_tasks_created_at
        ON tasks (created_at DESC, id DESC);

      CREATE INDEX idx_tasks_status_created_at
        ON tasks (status, created_at DESC, id DESC);
    `,
  },
];

type Queryable = Pick<Pool | PoolClient, "query">;

const MIGRATION_LOCK_ID = 727_274;

async function ensureMigrationsTable(database: Queryable): Promise<void> {
  await database.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    integer PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

export async function getSchemaVersion(database: Queryable): Promise<number> {
  await ensureMigrationsTable(database);
  const result = await database.query<{ version: string }>(
    "SELECT COALESCE(MAX(version), 0)::text AS version FROM schema_migrations",
  );
  return Number(result.rows[0]?.version ?? 0);
}

/**
 * Apply pending migrations under an advisory lock. Each migration and its
 * version row run in one transaction, so a failure leaves the schema untouched.
 */
export async function migrate(pool: Pool): Promise<number> {
  const latestVersion = migrations.at(-1)?.version ?? 0;
  const client = await pool.connect();

  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
    await ensureMigrationsTable(client);

    const currentVersion = await getSchemaVersion(client);
    if (currentVersion > latestVersion) {
      throw new Error(
        `Database schema version ${currentVersion} is newer than this build supports (${latestVersion}).`,
      );
    }

    for (const migration of migrations) {
      if (migration.version <= currentVersion) {
        continue;
      }

      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query(
          "INSERT INTO schema_migrations (version) VALUES ($1)",
          [migration.version],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    return latestVersion;
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]);
    } catch {
      // The connection may already be broken; releasing it is still safe.
    }
    client.release();
  }
}
