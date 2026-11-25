import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterEach, describe, expect, it } from "vitest";

import {
  getSchemaVersion,
  migrate,
  migrations,
} from "../../../src/db/migrations.js";
import {
  connectToSchema,
  TEST_DATABASE_URL,
} from "../../helpers/database.js";

interface ScratchSchema {
  readonly admin: Pool;
  readonly pool: Pool;
  readonly schema: string;
}

const scratchSchemas: ScratchSchema[] = [];

async function createScratchSchema(): Promise<ScratchSchema> {
  const admin = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
  const schema = `test_migrations_${randomUUID().replace(/-/g, "")}`;
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const pool = connectToSchema(schema);
  const scratch = { admin, pool, schema };
  scratchSchemas.push(scratch);
  return scratch;
}

afterEach(async () => {
  for (const scratch of scratchSchemas.splice(0)) {
    if (!scratch.pool.ended) {
      await scratch.pool.end();
    }
    await scratch.admin.query(
      `DROP SCHEMA IF EXISTS "${scratch.schema}" CASCADE`,
    );
    await scratch.admin.end();
  }
});

describe("migrations", () => {
  it("migrates a fresh database to the latest version", async () => {
    const { pool } = await createScratchSchema();

    expect(await getSchemaVersion(pool)).toBe(0);
    expect(await migrate(pool)).toBe(migrations.at(-1)?.version);
    expect(await getSchemaVersion(pool)).toBe(1);
  });

  it("creates the task table and both indexes", async () => {
    const { pool, schema } = await createScratchSchema();
    await migrate(pool);

    const objects = await pool.query<{ name: string }>(
      `
      SELECT tablename AS name FROM pg_tables WHERE schemaname = $1
      UNION ALL
      SELECT indexname AS name FROM pg_indexes WHERE schemaname = $1
    `,
      [schema],
    );
    const names = objects.rows.map((object) => object.name);

    expect(names).toContain("tasks");
    expect(names).toContain("schema_migrations");
    expect(names).toContain("idx_tasks_created_at");
    expect(names).toContain("idx_tasks_status_created_at");
  });

  it("is idempotent when run twice", async () => {
    const { pool } = await createScratchSchema();
    await migrate(pool);
    await migrate(pool);

    const tables = await pool.query<{ total: number }>(
      "SELECT COUNT(*)::int AS total FROM schema_migrations",
    );

    expect(await getSchemaVersion(pool)).toBe(1);
    expect(tables.rows[0]?.total).toBe(1);
  });

  it("refuses a database newer than the code", async () => {
    const { pool } = await createScratchSchema();
    await migrate(pool);
    await pool.query("INSERT INTO schema_migrations (version) VALUES (2)");

    await expect(migrate(pool)).rejects.toThrow(
      /newer than this build supports/,
    );
  });

  it("persists the schema version across a reconnect", async () => {
    const { pool, schema } = await createScratchSchema();
    await migrate(pool);
    await pool.end();

    const reopened = connectToSchema(schema);
    try {
      expect(await getSchemaVersion(reopened)).toBe(1);
      expect(await migrate(reopened)).toBe(1);
    } finally {
      await reopened.end();
    }
  });
});
