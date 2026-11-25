import { describe, expect, it } from "vitest";

import {
  checkDatabase,
  closeDatabase,
  createDatabasePool,
} from "../../../src/db/connection.js";
import { TEST_DATABASE_URL } from "../../helpers/database.js";

describe("database pool", () => {
  it("connects to PostgreSQL and answers a probe", async () => {
    const pool = createDatabasePool({
      connectionString: TEST_DATABASE_URL,
      max: 1,
    });

    try {
      await expect(checkDatabase(pool)).resolves.toBeUndefined();
    } finally {
      await closeDatabase(pool);
    }
  });

  it("tolerates a second close call", async () => {
    const pool = createDatabasePool({
      connectionString: TEST_DATABASE_URL,
      max: 1,
    });

    await closeDatabase(pool);
    await expect(closeDatabase(pool)).resolves.toBeUndefined();
  });

  it("rejects a probe after the pool is closed", async () => {
    const pool = createDatabasePool({
      connectionString: TEST_DATABASE_URL,
      max: 1,
    });
    await closeDatabase(pool);

    await expect(checkDatabase(pool)).rejects.toThrow();
  });
});
