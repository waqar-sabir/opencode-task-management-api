import { Pool } from "pg";

export interface DatabaseOptions {
  readonly connectionString: string;
  readonly ssl?: boolean;
  readonly max?: number;
  /** PostgreSQL `options` string, used by tests to select a schema. */
  readonly options?: string;
}

/** Create the only connection pool the process owns. */
export function createDatabasePool(options: DatabaseOptions): Pool {
  return new Pool({
    connectionString: options.connectionString,
    ssl: options.ssl ? { rejectUnauthorized: false } : false,
    max: options.max ?? 10,
    ...(options.options ? { options: options.options } : {}),
  });
}

/** Verify the database answers; used by `/healthz` and startup checks. */
export async function checkDatabase(pool: Pool): Promise<void> {
  await pool.query("SELECT 1");
}

/** Close the pool. Safe to call more than once. */
export async function closeDatabase(pool: Pool): Promise<void> {
  if (pool.ended) {
    return;
  }
  await pool.end();
}
