import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { getSchemaVersion } from "../../src/db/migrations.js";
import { PostgresTaskRepository } from "../../src/db/postgres-task-repository.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../helpers/database.js";

const databases: TestDatabase[] = [];

async function testDatabase(): Promise<TestDatabase> {
  const database = await createTestDatabase();
  databases.push(database);
  return database;
}

afterEach(async () => {
  for (const database of databases.splice(0)) {
    await database.close();
  }
});

describe("persistence", () => {
  it("keeps tasks across a close/reopen cycle", async () => {
    const database = await testDatabase();
    const id = randomUUID();

    const firstRepository = new PostgresTaskRepository(database.pool);
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

    await database.reconnect();
    const secondRepository = new PostgresTaskRepository(database.pool);

    await expect(secondRepository.findById(id)).resolves.toMatchObject({
      id,
      title: "Updated before restart",
      status: "todo",
      updatedAt: "2026-11-19T10:01:00.000Z",
    });
  });

  it("keeps completion and deletion across a reopen", async () => {
    const database = await testDatabase();
    const completedId = randomUUID();
    const deletedId = randomUUID();

    const firstRepository = new PostgresTaskRepository(database.pool);
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

    await database.reconnect();
    const secondRepository = new PostgresTaskRepository(database.pool);

    await expect(secondRepository.findById(completedId)).resolves.toMatchObject({
      status: "completed",
      completedAt: "2026-11-19T11:00:00.000Z",
    });
    await expect(secondRepository.findById(deletedId)).resolves.toBeNull();
  });

  it("reports the migrated schema version after a reconnect", async () => {
    const database = await testDatabase();
    expect(await getSchemaVersion(database.pool)).toBe(1);

    await database.reconnect();
    expect(await getSchemaVersion(database.pool)).toBe(1);

    const repository = new PostgresTaskRepository(database.pool);
    await expect(
      repository.list({
        page: 1,
        limit: 20,
        sort: "createdAt",
        order: "desc",
      }),
    ).resolves.toEqual({ items: [], total: 0 });
  });

  it("keeps isolated schemas separate", async () => {
    const first = await testDatabase();
    const second = await testDatabase();

    await new PostgresTaskRepository(first.pool).create({
      id: randomUUID(),
      title: "Only in first",
      description: "",
      createdAt: "2026-11-19T10:00:00.000Z",
      updatedAt: "2026-11-19T10:00:00.000Z",
    });

    await expect(
      new PostgresTaskRepository(second.pool).list({
        page: 1,
        limit: 20,
        sort: "createdAt",
        order: "desc",
      }),
    ).resolves.toEqual({ items: [], total: 0 });
  });
});
