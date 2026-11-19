import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { pino } from "pino";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../../src/app.js";
import { openDatabase } from "../../src/db/connection.js";
import { migrate } from "../../src/db/migrations.js";
import { SqliteTaskRepository } from "../../src/db/sqlite-task-repository.js";
import { shutdown } from "../../src/shutdown.js";

const logger = pino({ level: "silent" });
const temporaryDirectories: string[] = [];

function temporaryDatabasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "task-api-shutdown-"));
  temporaryDirectories.push(directory);
  return join(directory, "tasks.db");
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("shutdown", () => {
  it("stops the server, closes the database, and leaves it reopenable", async () => {
    const path = temporaryDatabasePath();
    const database = openDatabase(path);
    migrate(database);
    const repository = new SqliteTaskRepository(database);

    const app = createApp({
      repository,
      logger,
      healthCheck: () => {
        database.prepare("SELECT 1").get();
      },
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

    await shutdown({ server, database, logger });

    expect(server.listening).toBe(false);
    expect(database.isOpen).toBe(false);

    const reopened = new DatabaseSync(path);
    const row = reopened
      .prepare("SELECT COUNT(*) AS total FROM tasks")
      .get() as unknown as { total: number };
    expect(row.total).toBe(1);
    reopened.close();
  });

  it("closes the database even when the server was never listening", async () => {
    const database = openDatabase(":memory:");
    migrate(database);

    const server = createServer();
    await expect(
      shutdown({ server, database, logger, timeoutMs: 50 }),
    ).resolves.toBeUndefined();
    expect(database.isOpen).toBe(false);
  });

  it("is safe to call with an already closed database", async () => {
    const database = openDatabase(":memory:");
    const server = createServer();

    await shutdown({ server, database, logger, timeoutMs: 50 });
    await expect(
      shutdown({ server, database, logger, timeoutMs: 50 }),
    ).resolves.toBeUndefined();
  });
});
