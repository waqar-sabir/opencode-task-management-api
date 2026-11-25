import type { Server } from "node:http";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { pino } from "pino";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../../src/app.js";
import { checkDatabase } from "../../src/db/connection.js";
import { PostgresTaskRepository } from "../../src/db/postgres-task-repository.js";
import { shutdown } from "../../src/shutdown.js";
import {
  connectToSchema,
  createTestDatabase,
  type TestDatabase,
} from "../helpers/database.js";

const logger = pino({ level: "silent" });
const databases: TestDatabase[] = [];

afterEach(async () => {
  for (const database of databases.splice(0)) {
    await database.close();
  }
});

describe("shutdown", () => {
  it("stops the server, closes the pool, and leaves data in PostgreSQL", async () => {
    const database = await createTestDatabase();
    databases.push(database);

    const app = createApp({
      repository: new PostgresTaskRepository(database.pool),
      logger,
      healthCheck: () => checkDatabase(database.pool),
    });

    const server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, "127.0.0.1", () => {
        resolve(listening);
      });
    });

    const { port } = server.address() as AddressInfo;
    const created = await fetch(`http://127.0.0.1:${port}/api/v1/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Survives shutdown" }),
    });

    expect(created.status).toBe(201);

    await shutdown({ server, database: database.pool, logger });

    expect(server.listening).toBe(false);
    expect(database.pool.ended).toBe(true);

    const reopened = connectToSchema(database.schema);
    try {
      const row = await reopened.query<{ total: number }>(
        "SELECT COUNT(*)::int AS total FROM tasks",
      );
      expect(row.rows[0]?.total).toBe(1);
    } finally {
      await reopened.end();
    }
  });

  it("closes the pool even when the server was never listening", async () => {
    const database = await createTestDatabase();
    databases.push(database);
    const server = createServer();

    await expect(
      shutdown({ server, database: database.pool, logger, timeoutMs: 50 }),
    ).resolves.toBeUndefined();
    expect(database.pool.ended).toBe(true);
  });

  it("is safe to call with an already closed pool", async () => {
    const database = await createTestDatabase();
    databases.push(database);
    const server = createServer();

    await shutdown({ server, database: database.pool, logger, timeoutMs: 50 });
    await expect(
      shutdown({ server, database: database.pool, logger, timeoutMs: 50 }),
    ).resolves.toBeUndefined();
  });
});
