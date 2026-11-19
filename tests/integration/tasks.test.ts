import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

import type { Express } from "express";
import { pino } from "pino";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../../src/app.js";
import { migrate } from "../../src/db/migrations.js";
import { SqliteTaskRepository } from "../../src/db/sqlite-task-repository.js";

const T1 = "2026-11-19T10:00:00.000Z";
const T2 = "2026-11-19T10:01:00.000Z";
const T3 = "2026-11-19T10:02:00.000Z";

const logger = pino({ level: "silent" });

let database: DatabaseSync;
let repository: SqliteTaskRepository;
let app: Express;

beforeEach(() => {
  database = new DatabaseSync(":memory:");
  migrate(database);
  repository = new SqliteTaskRepository(database);
  app = createApp({ repository, logger });
});

afterEach(() => {
  database.close();
});

function createTask(
  payload: Record<string, unknown> = { title: "Prepare release notes" },
) {
  return request(app).post("/api/v1/tasks").send(payload);
}

describe("POST /api/v1/tasks", () => {
  it("creates a task with defaults and a Location header", async () => {
    const response = await createTask({
      title: "  Prepare release notes  ",
      description: "Cover the API changes.",
    });

    expect(response.status).toBe(201);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.body).toMatchObject({
      title: "Prepare release notes",
      description: "Cover the API changes.",
      status: "todo",
      completedAt: null,
    });
    expect(response.body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(response.body.createdAt).toBe(response.body.updatedAt);
    expect(response.body.createdAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    expect(response.headers.location).toBe(`/api/v1/tasks/${response.body.id}`);
  });

  it("defaults a missing description to an empty string", async () => {
    const response = await createTask({ title: "Only a title" });

    expect(response.status).toBe(201);
    expect(response.body.description).toBe("");
  });

  it("rejects a whitespace-only title", async () => {
    const response = await createTask({ title: "   " });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.details[0].path).toBe("title");
  });

  it("accepts 200 code points and rejects 201", async () => {
    const ok = await createTask({ title: "é".repeat(200) });
    const tooLong = await createTask({ title: "é".repeat(201) });

    expect(ok.status).toBe(201);
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error.details[0].path).toBe("title");
  });

  it("accepts a 2000 code point description and rejects 2001", async () => {
    const ok = await createTask({
      title: "Descriptions",
      description: "a".repeat(2000),
    });
    const tooLong = await createTask({
      title: "Descriptions",
      description: "a".repeat(2001),
    });

    expect(ok.status).toBe(201);
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error.details[0].path).toBe("description");
  });

  it.each(["id", "status", "createdAt", "updatedAt", "completedAt", "owner"])(
    "rejects the client-supplied field %s",
    async (field) => {
      const response = await createTask({
        title: "Rejected",
        [field]: "value",
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    },
  );

  it("accepts duplicate titles", async () => {
    const first = await createTask({ title: "Same" });
    const second = await createTask({ title: "Same" });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.id).not.toBe(second.body.id);
  });

  it("rejects a malformed JSON body", async () => {
    const response = await request(app)
      .post("/api/v1/tasks")
      .set("Content-Type", "application/json")
      .send('{"title":');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a non-JSON content type", async () => {
    const response = await request(app)
      .post("/api/v1/tasks")
      .set("Content-Type", "text/plain")
      .send('{"title":"x"}');

    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("rejects a body over 100 KB", async () => {
    const response = await request(app)
      .post("/api/v1/tasks")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ title: "Big", description: "a".repeat(120_000) }));

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("makes the task immediately retrievable and listable", async () => {
    const created = await createTask({ title: "Findable" });

    const detail = await request(app).get(`/api/v1/tasks/${created.body.id}`);
    const list = await request(app).get("/api/v1/tasks");

    expect(detail.status).toBe(200);
    expect(detail.body).toEqual(created.body);
    expect(list.body.total).toBe(1);
    expect(list.body.items[0].id).toBe(created.body.id);
  });
});

describe("GET /api/v1/tasks/:id", () => {
  it("returns a malformed UUID as a validation error", async () => {
    const response = await request(app).get("/api/v1/tasks/not-a-uuid");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 for an unknown UUID", async () => {
    const response = await request(app).get(`/api/v1/tasks/${randomUUID()}`);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: "NOT_FOUND", message: "Task not found" },
    });
  });

  it("returns 404 for an unknown route", async () => {
    const response = await request(app).get("/api/v1/unknown");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });
});

describe("GET /api/v1/tasks", () => {
  it("returns the default page envelope", async () => {
    const response = await request(app).get("/api/v1/tasks");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      items: [],
      page: 1,
      limit: 20,
      total: 0,
    });
  });

  it("defaults to newest first", async () => {
    await repository.create({
      id: randomUUID(),
      title: "Older",
      description: "",
      createdAt: T1,
      updatedAt: T1,
    });
    await repository.create({
      id: randomUUID(),
      title: "Newer",
      description: "",
      createdAt: T2,
      updatedAt: T2,
    });

    const response = await request(app).get("/api/v1/tasks");

    expect(
      response.body.items.map((task: { title: string }) => task.title),
    ).toEqual(["Newer", "Older"]);
    expect(response.body.total).toBe(2);
  });

  it("paginates while reporting the filtered total", async () => {
    for (const [index, createdAt] of [T1, T2, T3].entries()) {
      await repository.create({
        id: randomUUID(),
        title: `Task ${index + 1}`,
        description: "",
        createdAt,
        updatedAt: createdAt,
      });
    }

    const response = await request(app).get("/api/v1/tasks?page=2&limit=2");

    expect(response.body.page).toBe(2);
    expect(response.body.limit).toBe(2);
    expect(response.body.total).toBe(3);
    expect(response.body.items).toHaveLength(1);
  });

  it("returns an empty page past the end", async () => {
    await createTask({ title: "Only one" });

    const response = await request(app).get("/api/v1/tasks?page=9");

    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([]);
    expect(response.body.total).toBe(1);
  });

  it.each([
    "page=0",
    "page=1.5",
    "page=abc",
    "limit=0",
    "limit=101",
    "limit=2.5",
  ])("rejects invalid paging %s", async (query) => {
    const response = await request(app).get(`/api/v1/tasks?${query}`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("accepts the maximum limit", async () => {
    const response = await request(app).get("/api/v1/tasks?limit=100");

    expect(response.status).toBe(200);
    expect(response.body.limit).toBe(100);
  });

  it.each(["sort=created", "sort=description", "order=up", "order=DESC"])(
    "rejects invalid sort input %s",
    async (query) => {
      const response = await request(app).get(`/api/v1/tasks?${query}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    },
  );

  it("rejects unknown query parameters", async () => {
    const response = await request(app).get("/api/v1/tasks?owner=me");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("sorts by title case-insensitively", async () => {
    await createTask({ title: "banana" });
    await createTask({ title: "Apple" });

    const response = await request(app).get(
      "/api/v1/tasks?sort=title&order=asc",
    );

    expect(
      response.body.items.map((task: { title: string }) => task.title),
    ).toEqual(["Apple", "banana"]);
  });

  it("sorts by updatedAt", async () => {
    const first = randomUUID();
    const second = randomUUID();

    await repository.create({
      id: first,
      title: "First",
      description: "",
      createdAt: T1,
      updatedAt: T1,
    });
    await repository.create({
      id: second,
      title: "Second",
      description: "",
      createdAt: T2,
      updatedAt: T2,
    });
    await repository.updateContent(second, { title: "Second" }, T3);

    const response = await request(app).get(
      "/api/v1/tasks?sort=updatedAt&order=desc",
    );

    expect(response.body.items[0].title).toBe("Second");
  });

  it("breaks equal sort values by id in the same direction", async () => {
    await repository.create({
      id: "aaa",
      title: "A",
      description: "",
      createdAt: T1,
      updatedAt: T1,
    });
    await repository.create({
      id: "bbb",
      title: "B",
      description: "",
      createdAt: T1,
      updatedAt: T1,
    });

    const ascending = await request(app).get("/api/v1/tasks?order=asc");
    const descending = await request(app).get("/api/v1/tasks?order=desc");

    expect(ascending.body.items.map((task: { id: string }) => task.id)).toEqual(
      ["aaa", "bbb"],
    );
    expect(
      descending.body.items.map((task: { id: string }) => task.id),
    ).toEqual(["bbb", "aaa"]);
  });

  it("includes completed tasks by default", async () => {
    const completed = randomUUID();
    await repository.create({
      id: completed,
      title: "Done",
      description: "",
      createdAt: T1,
      updatedAt: T1,
    });
    await repository.complete(completed, T2);

    const response = await request(app).get("/api/v1/tasks");

    expect(response.body.total).toBe(1);
    expect(response.body.items[0].status).toBe("completed");
  });

  it("filters by status", async () => {
    const done = (await createTask({ title: "Done" })).body.id as string;
    await createTask({ title: "Open" });
    await repository.complete(done, T3);

    const completed = await request(app).get("/api/v1/tasks?status=completed");
    const todo = await request(app).get("/api/v1/tasks?status=todo");

    expect(completed.body.total).toBe(1);
    expect(completed.body.items[0].title).toBe("Done");
    expect(todo.body.total).toBe(1);
    expect(todo.body.items[0].title).toBe("Open");
  });

  it.each(["status=done", "status=todo&status=completed"])(
    "rejects an invalid status filter %s",
    async (query) => {
      const response = await request(app).get(`/api/v1/tasks?${query}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    },
  );

  it("searches titles and descriptions", async () => {
    await createTask({
      title: "Prepare release notes",
      description: "Cover the API changes.",
    });
    await createTask({
      title: "Buy milk",
      description: "Release day supplies",
    });

    const byTitle = await request(app).get("/api/v1/tasks?q=release+not");
    const byDescription = await request(app).get("/api/v1/tasks?q=supplies");

    expect(byTitle.body.total).toBe(1);
    expect(byTitle.body.items[0].title).toBe("Prepare release notes");
    expect(byDescription.body.total).toBe(1);
    expect(byDescription.body.items[0].title).toBe("Buy milk");
  });

  it("combines search and status with AND", async () => {
    await createTask({ title: "Report draft" });
    await createTask({ title: "Report final" });

    const response = await request(app).get(
      "/api/v1/tasks?q=report&status=todo",
    );

    expect(response.body.total).toBe(2);
  });

  it("echoes a provided request id", async () => {
    const response = await request(app)
      .get("/api/v1/tasks")
      .set("X-Request-Id", "client-request-1");

    expect(response.headers["x-request-id"]).toBe("client-request-1");
  });

  it("generates a request id when none is supplied", async () => {
    const response = await request(app).get("/api/v1/tasks");

    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("logs the full path without the query string", async () => {
    const lines: string[] = [];
    const stream = {
      write: (line: string) => {
        lines.push(line);
      },
    };
    const capturedApp = createApp({
      repository,
      logger: pino({ level: "info" }, stream),
    });

    await request(capturedApp).get("/api/v1/tasks?q=secret-term");

    const entries = lines
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter((entry) => entry.msg === "request");

    expect(entries).toHaveLength(1);
    expect(entries[0]?.path).toBe("/api/v1/tasks");
    expect(JSON.stringify(entries[0])).not.toContain("secret-term");
  });
});
