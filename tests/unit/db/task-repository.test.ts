import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PostgresTaskRepository } from "../../../src/db/postgres-task-repository.js";
import type {
  CreateTaskRecord,
  TaskListQuery,
} from "../../../src/repositories/task-repository.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../helpers/database.js";

const T1 = "2026-11-19T10:00:00.000Z";
const T2 = "2026-11-19T10:01:00.000Z";
const T3 = "2026-11-19T10:02:00.000Z";

function record(overrides: Partial<CreateTaskRecord> = {}): CreateTaskRecord {
  return {
    id: randomUUID(),
    title: "Task",
    description: "",
    createdAt: T1,
    updatedAt: T1,
    ...overrides,
  };
}

function listQuery(overrides: Partial<TaskListQuery> = {}): TaskListQuery {
  return {
    page: 1,
    limit: 20,
    sort: "createdAt",
    order: "desc",
    ...overrides,
  };
}

let database: TestDatabase;
let repository: PostgresTaskRepository;

beforeEach(async () => {
  database = await createTestDatabase();
  repository = new PostgresTaskRepository(database.pool);
});

afterEach(async () => {
  await database.close();
});

describe("create and find", () => {
  it("stores a new task as todo with no completion time", async () => {
    const input = record({
      title: "Write release notes",
      description: "Draft",
    });

    const task = await repository.create(input);

    expect(task).toEqual({
      id: input.id,
      title: "Write release notes",
      description: "Draft",
      status: "todo",
      createdAt: T1,
      updatedAt: T1,
      completedAt: null,
    });
    expect(await repository.findById(input.id)).toEqual(task);
  });

  it("returns null for an unknown id", async () => {
    expect(await repository.findById(randomUUID())).toBeNull();
  });
});

describe("updateContent", () => {
  it("changes only supplied fields and refreshes updatedAt", async () => {
    const input = record({ title: "Old title", description: "Keep me" });
    await repository.create(input);

    const updated = await repository.updateContent(
      input.id,
      { title: "New title" },
      T2,
    );

    expect(updated?.title).toBe("New title");
    expect(updated?.description).toBe("Keep me");
    expect(updated?.createdAt).toBe(T1);
    expect(updated?.updatedAt).toBe(T2);
  });

  it("updates the description without touching the title", async () => {
    const input = record({ title: "Stable", description: "" });
    await repository.create(input);

    const updated = await repository.updateContent(
      input.id,
      { description: "Now described" },
      T2,
    );

    expect(updated?.title).toBe("Stable");
    expect(updated?.description).toBe("Now described");
  });

  it("returns null and writes nothing for an unknown id", async () => {
    const input = record();
    await repository.create(input);

    const updated = await repository.updateContent(
      randomUUID(),
      { title: "Ignored" },
      T2,
    );

    expect(updated).toBeNull();
    expect(await repository.findById(input.id)).toMatchObject({
      title: "Task",
      updatedAt: T1,
    });
  });
});

describe("delete", () => {
  it("removes the row once and reports the second attempt", async () => {
    const input = record();
    await repository.create(input);

    expect(await repository.delete(input.id)).toBe(true);
    expect(await repository.delete(input.id)).toBe(false);
    expect(await repository.findById(input.id)).toBeNull();
  });
});

describe("complete", () => {
  it("sets status, completion time, and updatedAt", async () => {
    const input = record();
    await repository.create(input);

    const completed = await repository.complete(input.id, T2);

    expect(completed?.status).toBe("completed");
    expect(completed?.completedAt).toBe(T2);
    expect(completed?.updatedAt).toBe(T2);
  });

  it("is idempotent and preserves the first completion timestamps", async () => {
    const input = record();
    await repository.create(input);
    await repository.complete(input.id, T2);

    const second = await repository.complete(input.id, T3);

    expect(second?.completedAt).toBe(T2);
    expect(second?.updatedAt).toBe(T2);
  });

  it("returns null for an unknown id", async () => {
    expect(await repository.complete(randomUUID(), T2)).toBeNull();
  });
});

describe("list", () => {
  it("returns newest first with a page envelope", async () => {
    await repository.create(record({ title: "First", createdAt: T1 }));
    await repository.create(record({ title: "Second", createdAt: T2 }));
    await repository.create(record({ title: "Third", createdAt: T3 }));

    const page = await repository.list(listQuery());

    expect(page.total).toBe(3);
    expect(page.items.map((task) => task.title)).toEqual([
      "Third",
      "Second",
      "First",
    ]);
  });

  it("paginates while reporting the full total", async () => {
    await repository.create(record({ title: "First", createdAt: T1 }));
    await repository.create(record({ title: "Second", createdAt: T2 }));
    await repository.create(record({ title: "Third", createdAt: T3 }));

    const page = await repository.list(listQuery({ page: 2, limit: 2 }));

    expect(page.total).toBe(3);
    expect(page.items.map((task) => task.title)).toEqual(["First"]);
  });

  it("returns an empty page past the end", async () => {
    await repository.create(record());

    const page = await repository.list(listQuery({ page: 5 }));

    expect(page.items).toEqual([]);
    expect(page.total).toBe(1);
  });

  it("filters by status", async () => {
    const done = record({ title: "Done", createdAt: T1 });
    await repository.create(done);
    await repository.create(record({ title: "Open", createdAt: T2 }));
    await repository.complete(done.id, T3);

    const completed = await repository.list(listQuery({ status: "completed" }));
    const todo = await repository.list(listQuery({ status: "todo" }));

    expect(completed.items.map((task) => task.title)).toEqual(["Done"]);
    expect(todo.items.map((task) => task.title)).toEqual(["Open"]);
  });

  it("matches title and description as substrings", async () => {
    await repository.create(
      record({ title: "Prepare release notes", description: "Cover the API" }),
    );
    await repository.create(
      record({ title: "Buy milk", description: "Release day supplies" }),
    );

    const byTitle = await repository.list(listQuery({ q: "release not" }));
    const byDescription = await repository.list(listQuery({ q: "supplies" }));

    expect(byTitle.total).toBe(1);
    expect(byTitle.items[0]?.title).toBe("Prepare release notes");
    expect(byDescription.total).toBe(1);
    expect(byDescription.items[0]?.title).toBe("Buy milk");
  });

  it("does not match across the title/description boundary", async () => {
    await repository.create(record({ title: "alpha", description: "beta" }));
    await repository.create(record({ title: "alpha\nbeta", description: "" }));

    const page = await repository.list(listQuery({ q: "alpha\nbeta" }));

    expect(page.total).toBe(1);
    expect(page.items[0]?.title).toBe("alpha\nbeta");
  });

  it("matches non-ASCII case pairs", async () => {
    await repository.create(record({ title: "Café run" }));

    const page = await repository.list(listQuery({ q: "CAFÉ" }));

    expect(page.total).toBe(1);
  });

  it("does not fold accents", async () => {
    await repository.create(record({ title: "Café run" }));

    const page = await repository.list(listQuery({ q: "cafe" }));

    expect(page.total).toBe(0);
  });

  it("treats LIKE metacharacters literally", async () => {
    await repository.create(record({ title: "100% complete" }));
    await repository.create(record({ title: "snake_case" }));
    await repository.create(record({ title: "back\\slash" }));
    await repository.create(record({ title: "unrelated" }));

    const percent = await repository.list(listQuery({ q: "%" }));
    const underscore = await repository.list(listQuery({ q: "_" }));
    const backslash = await repository.list(listQuery({ q: "\\" }));

    expect(percent.items.map((task) => task.title)).toEqual(["100% complete"]);
    expect(underscore.items.map((task) => task.title)).toEqual(["snake_case"]);
    expect(backslash.items.map((task) => task.title)).toEqual(["back\\slash"]);
  });

  it("combines search and status with AND", async () => {
    const match = record({ title: "Report draft", createdAt: T1 });
    await repository.create(match);
    await repository.create(record({ title: "Report final", createdAt: T2 }));
    await repository.complete(match.id, T3);

    const page = await repository.list(
      listQuery({ q: "report", status: "completed" }),
    );

    expect(page.total).toBe(1);
    expect(page.items[0]?.title).toBe("Report draft");
  });

  it("sorts by title case-insensitively", async () => {
    await repository.create(record({ title: "banana" }));
    await repository.create(record({ title: "Apple" }));

    const page = await repository.list(
      listQuery({ sort: "title", order: "asc" }),
    );

    expect(page.items.map((task) => task.title)).toEqual(["Apple", "banana"]);
  });

  it("sorts by updatedAt", async () => {
    const first = record({ title: "First", createdAt: T1 });
    const second = record({ title: "Second", createdAt: T2 });
    await repository.create(first);
    await repository.create(second);
    await repository.updateContent(second.id, { title: "Second" }, T3);

    const page = await repository.list(
      listQuery({ sort: "updatedAt", order: "desc" }),
    );

    expect(page.items[0]?.title).toBe("Second");
  });

  it("tie-breaks equal sort values by id", async () => {
    await repository.create(record({ id: "aaa", title: "A", createdAt: T1 }));
    await repository.create(record({ id: "bbb", title: "B", createdAt: T1 }));

    const ascending = await repository.list(listQuery({ order: "asc" }));
    const descending = await repository.list(listQuery({ order: "desc" }));

    expect(ascending.items.map((task) => task.id)).toEqual(["aaa", "bbb"]);
    expect(descending.items.map((task) => task.id)).toEqual(["bbb", "aaa"]);
  });
});

describe("database constraints", () => {
  async function insertRaw(
    overrides: Partial<Record<string, string | null>>,
  ): Promise<void> {
    const values = {
      id: randomUUID(),
      title: "Valid",
      description: "",
      search_title: "valid",
      search_description: "",
      status: "todo",
      created_at: T1,
      updated_at: T1,
      completed_at: null,
      ...overrides,
    };

    await database.pool.query(
      `
      INSERT INTO tasks
        (id, title, description, search_title, search_description,
         status, created_at, updated_at, completed_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
      [
        values.id,
        values.title,
        values.description,
        values.search_title,
        values.search_description,
        values.status,
        values.created_at,
        values.updated_at,
        values.completed_at,
      ],
    );
  }

  it("rejects an unknown status", async () => {
    await expect(insertRaw({ status: "in_progress" })).rejects.toThrow();
  });

  it("rejects a completed task without a completion time", async () => {
    await expect(insertRaw({ status: "completed" })).rejects.toThrow();
  });

  it("rejects a todo task with a completion time", async () => {
    await expect(insertRaw({ completed_at: T2 })).rejects.toThrow();
  });

  it("rejects an empty title", async () => {
    await expect(insertRaw({ title: "   " })).rejects.toThrow();
  });

  it("rejects a title over 200 characters", async () => {
    await expect(insertRaw({ title: "x".repeat(201) })).rejects.toThrow();
  });

  it("counts astral title characters as code points", async () => {
    await expect(insertRaw({ title: "😀".repeat(201) })).rejects.toThrow();
  });

  it("rejects a description over 2000 characters", async () => {
    await expect(insertRaw({ description: "x".repeat(2001) })).rejects.toThrow();
  });

  it("counts astral description characters as code points", async () => {
    await expect(
      insertRaw({ description: "😀".repeat(2001) }),
    ).rejects.toThrow();
  });
});
