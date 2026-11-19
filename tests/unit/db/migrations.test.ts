import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import { closeDatabase, openDatabase } from "../../../src/db/connection.js";
import { getSchemaVersion, migrate } from "../../../src/db/migrations.js";

const temporaryDirectories: string[] = [];

function temporaryDatabasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "task-api-migrations-"));
  temporaryDirectories.push(directory);
  return join(directory, "tasks.db");
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("migrations", () => {
  it("migrates a fresh database to version 1", () => {
    const database = new DatabaseSync(":memory:");

    expect(getSchemaVersion(database)).toBe(0);
    expect(migrate(database)).toBe(1);
    expect(getSchemaVersion(database)).toBe(1);

    database.close();
  });

  it("creates the task table and both indexes", () => {
    const database = new DatabaseSync(":memory:");
    migrate(database);

    const objects = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type IN ('table', 'index')",
      )
      .all() as unknown as { name: string }[];
    const names = objects.map((object) => object.name);

    expect(names).toContain("tasks");
    expect(names).toContain("idx_tasks_created_at");
    expect(names).toContain("idx_tasks_status_created_at");

    database.close();
  });

  it("is idempotent when run twice", () => {
    const database = new DatabaseSync(":memory:");
    migrate(database);
    migrate(database);

    const tables = database
      .prepare(
        "SELECT COUNT(*) AS total FROM sqlite_master WHERE name = 'tasks'",
      )
      .get() as unknown as { total: number };

    expect(getSchemaVersion(database)).toBe(1);
    expect(tables.total).toBe(1);

    database.close();
  });

  it("refuses a database newer than the code", () => {
    const database = new DatabaseSync(":memory:");
    migrate(database);
    database.exec("PRAGMA user_version = 2");

    expect(() => migrate(database)).toThrow(/newer than this build supports/);

    database.close();
  });

  it("persists the schema version in a file database", () => {
    const path = temporaryDatabasePath();
    const first = openDatabase(path);
    migrate(first);
    first.close();

    const reopened = openDatabase(path);
    expect(getSchemaVersion(reopened)).toBe(1);
    expect(migrate(reopened)).toBe(1);
    closeDatabase(reopened);
  });
});
