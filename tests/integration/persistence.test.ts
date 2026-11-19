import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { closeDatabase, openDatabase } from "../../src/db/connection.js";
import { migrate } from "../../src/db/migrations.js";
import { SqliteTaskRepository } from "../../src/db/sqlite-task-repository.js";

const temporaryDirectories: string[] = [];

function temporaryDatabasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "task-api-persistence-"));
  temporaryDirectories.push(directory);
  return join(directory, "tasks.db");
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("persistence", () => {
  it("keeps tasks across a close/reopen cycle", async () => {
    const path = temporaryDatabasePath();
    const id = randomUUID();

    const first = openDatabase(path);
    migrate(first);
    const firstRepository = new SqliteTaskRepository(first);

    await firstRepository.create({
      id,
      title: "Survives restart",
      description: "Durable",
      createdAt: "2026-11-19T10:00:00.000Z",
      updatedAt: "2026-11-19T10:00:00.000Z",
    });
    await firstRepository.updateContent(
      id,
      { title: "Updated before restart" },
      "2026-11-19T10:01:00.000Z",
    );
    closeDatabase(first);

    const second = openDatabase(path);
    migrate(second);
    const secondRepository = new SqliteTaskRepository(second);

    await expect(secondRepository.findById(id)).resolves.toMatchObject({
      id,
      title: "Updated before restart",
      status: "todo",
      updatedAt: "2026-11-19T10:01:00.000Z",
    });

    closeDatabase(second);
  });

  it("keeps completion and deletion across a reopen", async () => {
    const path = temporaryDatabasePath();
    const completedId = randomUUID();
    const deletedId = randomUUID();

    const first = openDatabase(path);
    migrate(first);
    const firstRepository = new SqliteTaskRepository(first);

    for (const id of [completedId, deletedId]) {
      await firstRepository.create({
        id,
        title: `Task ${id.slice(0, 4)}`,
        description: "",
        createdAt: "2026-11-19T10:00:00.000Z",
        updatedAt: "2026-11-19T10:00:00.000Z",
      });
    }

    await firstRepository.complete(completedId, "2026-11-19T11:00:00.000Z");
    await firstRepository.delete(deletedId);
    closeDatabase(first);

    const second = openDatabase(path);
    migrate(second);
    const secondRepository = new SqliteTaskRepository(second);

    await expect(secondRepository.findById(completedId)).resolves.toMatchObject(
      {
        status: "completed",
        completedAt: "2026-11-19T11:00:00.000Z",
      },
    );
    await expect(secondRepository.findById(deletedId)).resolves.toBeNull();

    closeDatabase(second);
  });

  it("does not touch ./data when driven by a temporary path", async () => {
    const path = temporaryDatabasePath();
    const database = openDatabase(path);
    migrate(database);
    await new SqliteTaskRepository(database).create({
      id: randomUUID(),
      title: "Scoped",
      description: "",
      createdAt: "2026-11-19T10:00:00.000Z",
      updatedAt: "2026-11-19T10:00:00.000Z",
    });

    expect(path).toContain("task-api-persistence-");
    closeDatabase(database);
  });
});
