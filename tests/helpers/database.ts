import { randomUUID } from "node:crypto";

import { Pool } from "pg";

import { migrate } from "../../src/db/migrations.js";

const DEFAULT_TEST_DATABASE_URL =
  "postgres://task:task@127.0.0.1:5433/task_management_test";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;

function createAdminPool(): Pool {
  return new Pool({
    connectionString: TEST_DATABASE_URL,
    max: 1,
  });
}

export function connectToSchema(schema: string): Pool {
  return new Pool({
    connectionString: TEST_DATABASE_URL,
    max: 5,
    options: `-c search_path=${schema}`,
  });
}

export interface TestDatabase {
  readonly pool: Pool;
  readonly schema: string;
  /** Close and reopen the pool against the same schema. */
  reconnect(): Promise<void>;
  /** End the pool and drop the isolated schema. */
  close(): Promise<void>;
}

/**
 * Create an isolated schema and run migrations in it. Every test gets its own
 * schema, so tests never share rows and never touch the development database.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const admin = createAdminPool();
  const schema = `test_${randomUUID().replace(/-/g, "")}`;

  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
  } catch (error) {
    await admin.end();
    throw new Error(
      `Could not create a test schema. Start PostgreSQL with "npm run db:up" and check TEST_DATABASE_URL (${TEST_DATABASE_URL}).`,
      { cause: error },
    );
  }

  let pool = connectToSchema(schema);
  try {
    await migrate(pool);
  } catch (error) {
    if (!pool.ended) {
      await pool.end();
    }
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
    throw error;
  }

  let closed = false;

  return {
    get pool() {
      return pool;
    },
    schema,
    async reconnect() {
      if (!pool.ended) {
        await pool.end();
      }
      pool = connectToSchema(schema);
    },
    async close() {
      if (closed) {
        return;
      }
      closed = true;
      if (!pool.ended) {
        await pool.end();
      }
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    },
  };
}
