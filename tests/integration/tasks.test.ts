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
  app = createApp({
    repository,
    logger,
    healthCheck: () => {
      database.prepare("SELECT 1").get();
    },
  });
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

  it("counts astral title characters as code points", async () => {
    const ok = await createTask({ title: "😀".repeat(200) });
    const tooLong = await createTask({ title: "😀".repeat(201) });

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

  it("counts astral description characters as code points", async () => {
    const ok = await createTask({
      title: "Descriptions",
      description: "😀".repeat(2000),
    });
    const tooLong = await createTask({
      title: "Descriptions",
      description: "😀".repeat(2001),
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

  it.each([
    "application/json-patch+json",
    "application/jsonp",
    "text/plain; note=application/json",
  ])("rejects the non-JSON media type %s", async (contentType) => {
    const response = await request(app)
      .post("/api/v1/tasks")
      .set("Content-Type", contentType)
      .send('{"title":"x"}');

    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("accepts a JSON media type with parameters", async () => {
    const response = await request(app)
      .post("/api/v1/tasks")
      .set("Content-Type", "application/json; charset=utf-8")
      .send('{"title":"x"}');

    expect(response.status).toBe(201);
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
    "page=1e1",
    "page=01",
    "page=%2B1",
    "limit=0",
    "limit=101",
    "limit=2.5",
    "limit=1e1",
    "limit=%201",
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

  it("replaces an overlong request id", async () => {
    const response = await request(app)
      .get("/api/v1/tasks")
      .set("X-Request-Id", "x".repeat(129));

    expect(response.headers["x-request-id"]).not.toBe("x".repeat(129));
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
      healthCheck: () => undefined,
    });

    await request(capturedApp).get("/api/v1/tasks?q=secret-term");

    const entries = lines
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter((entry) => entry.msg === "request");

    expect(entries).toHaveLength(1);
    expect(entries[0]?.path).toBe("/api/v1/tasks");
    expect(JSON.stringify(entries[0])).not.toContain("secret-term");
  });

  it("never logs titles, descriptions, or search terms", async () => {
    const lines: string[] = [];
    const stream = {
      write: (line: string) => {
        lines.push(line);
      },
    };
    const capturedApp = createApp({
      repository,
      logger: pino({ level: "info" }, stream),
      healthCheck: () => undefined,
    });

    await request(capturedApp).post("/api/v1/tasks").send({
      title: "CONFIDENTIAL-TITLE",
      description: "CONFIDENTIAL-DESCRIPTION",
    });
    await request(capturedApp).get("/api/v1/tasks?q=SECRETSEARCHTERM");

    const output = lines.join("\n");
    expect(output).not.toContain("CONFIDENTIAL-TITLE");
    expect(output).not.toContain("CONFIDENTIAL-DESCRIPTION");
    expect(output).not.toContain("SECRETSEARCHTERM");
    expect(output).toContain('"method":"POST"');
    expect(output).toContain('"method":"GET"');
  });
});

describe("PATCH /api/v1/tasks/:id", () => {
  it("updates only the supplied content fields", async () => {
    const created = await createTask({
      title: "Old title",
      description: "Keep me",
    });

    const response = await request(app)
      .patch(`/api/v1/tasks/${created.body.id}`)
      .send({ title: "New title" });

    expect(response.status).toBe(200);
    expect(response.body.title).toBe("New title");
    expect(response.body.description).toBe("Keep me");
  });

  it("keeps id and createdAt and never moves updatedAt backwards", async () => {
    const created = await createTask({ title: "Stable" });

    const response = await request(app)
      .patch(`/api/v1/tasks/${created.body.id}`)
      .send({ description: "Added" });

    expect(response.body.id).toBe(created.body.id);
    expect(response.body.createdAt).toBe(created.body.createdAt);
    expect(Date.parse(response.body.updatedAt)).toBeGreaterThanOrEqual(
      Date.parse(created.body.updatedAt),
    );
  });

  it("accepts an empty description to clear it", async () => {
    const created = await createTask({
      title: "Clearable",
      description: "Remove me",
    });

    const response = await request(app)
      .patch(`/api/v1/tasks/${created.body.id}`)
      .send({ description: "" });

    expect(response.status).toBe(200);
    expect(response.body.description).toBe("");
  });

  it("requires at least one content field", async () => {
    const created = await createTask({ title: "Untouched" });

    const response = await request(app)
      .patch(`/api/v1/tasks/${created.body.id}`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it.each(["status", "id", "createdAt", "updatedAt", "completedAt"])(
    "rejects the %s field",
    async (field) => {
      const created = await createTask({ title: "Guarded" });

      const response = await request(app)
        .patch(`/api/v1/tasks/${created.body.id}`)
        .send({ [field]: "value" });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    },
  );

  it("applies the create limits to title and description", async () => {
    const created = await createTask({ title: "Limits" });

    const longTitle = await request(app)
      .patch(`/api/v1/tasks/${created.body.id}`)
      .send({ title: "x".repeat(201) });
    const longDescription = await request(app)
      .patch(`/api/v1/tasks/${created.body.id}`)
      .send({ description: "x".repeat(2001) });

    expect(longTitle.status).toBe(400);
    expect(longDescription.status).toBe(400);
  });

  it("edits a completed task without reopening it", async () => {
    const created = await createTask({ title: "Completed" });
    const completed = await request(app).post(
      `/api/v1/tasks/${created.body.id}/complete`,
    );

    const response = await request(app)
      .patch(`/api/v1/tasks/${created.body.id}`)
      .send({ title: "Completed and renamed" });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("completed");
    expect(response.body.completedAt).toBe(completed.body.completedAt);
  });

  it("returns 404 for an unknown id and 400 for a malformed one", async () => {
    const unknown = await request(app)
      .patch(`/api/v1/tasks/${randomUUID()}`)
      .send({ title: "Ghost" });
    const malformed = await request(app)
      .patch("/api/v1/tasks/not-a-uuid")
      .send({ title: "Ghost" });

    expect(unknown.status).toBe(404);
    expect(malformed.status).toBe(400);
  });

  it("makes edited content searchable", async () => {
    const created = await createTask({ title: "Original" });

    await request(app)
      .patch(`/api/v1/tasks/${created.body.id}`)
      .send({ title: "Renamed subject", description: "Fresh details" });

    const byTitle = await request(app).get("/api/v1/tasks?q=renamed");
    const byDescription = await request(app).get(
      "/api/v1/tasks?q=fresh+details",
    );

    expect(byTitle.body.total).toBe(1);
    expect(byDescription.body.total).toBe(1);
  });
});

describe("DELETE /api/v1/tasks/:id", () => {
  it("returns 204 with no body", async () => {
    const created = await createTask({ title: "Delete me" });

    const response = await request(app).delete(
      `/api/v1/tasks/${created.body.id}`,
    );

    expect(response.status).toBe(204);
    expect(response.text).toBe("");
  });

  it("removes the task from detail, list, search, and filter", async () => {
    const created = await createTask({ title: "Vanishing task" });
    await request(app).delete(`/api/v1/tasks/${created.body.id}`);

    const detail = await request(app).get(`/api/v1/tasks/${created.body.id}`);
    const list = await request(app).get("/api/v1/tasks");
    const search = await request(app).get("/api/v1/tasks?q=vanishing");
    const filter = await request(app).get("/api/v1/tasks?status=todo");

    expect(detail.status).toBe(404);
    expect(list.body.total).toBe(0);
    expect(search.body.total).toBe(0);
    expect(filter.body.total).toBe(0);
  });

  it("returns 404 when deleting twice", async () => {
    const created = await createTask({ title: "Gone" });
    await request(app).delete(`/api/v1/tasks/${created.body.id}`);

    const second = await request(app).delete(
      `/api/v1/tasks/${created.body.id}`,
    );

    expect(second.status).toBe(404);
    expect(second.body.error.code).toBe("NOT_FOUND");
  });

  it("deletes completed tasks", async () => {
    const created = await createTask({ title: "Finished" });
    await request(app).post(`/api/v1/tasks/${created.body.id}/complete`);

    const response = await request(app).delete(
      `/api/v1/tasks/${created.body.id}`,
    );

    expect(response.status).toBe(204);
  });

  it("rejects a request body", async () => {
    const created = await createTask({ title: "Bodyless delete" });

    const response = await request(app)
      .delete(`/api/v1/tasks/${created.body.id}`)
      .send({ unexpected: "field" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a malformed id", async () => {
    const response = await request(app).delete("/api/v1/tasks/nope");

    expect(response.status).toBe(400);
  });
});

describe("POST /api/v1/tasks/:id/complete", () => {
  it("completes a todo task", async () => {
    const created = await createTask({ title: "Finish me" });

    const response = await request(app).post(
      `/api/v1/tasks/${created.body.id}/complete`,
    );

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("completed");
    expect(response.body.completedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    expect(Date.parse(response.body.updatedAt)).toBeGreaterThanOrEqual(
      Date.parse(created.body.updatedAt),
    );
  });

  it("is idempotent and preserves the original timestamps", async () => {
    const created = await createTask({ title: "Idempotent" });
    const first = await request(app).post(
      `/api/v1/tasks/${created.body.id}/complete`,
    );

    const second = await request(app).post(
      `/api/v1/tasks/${created.body.id}/complete`,
    );

    expect(second.status).toBe(200);
    expect(second.body.completedAt).toBe(first.body.completedAt);
    expect(second.body.updatedAt).toBe(first.body.updatedAt);
  });

  it("returns 404 for an unknown id and 400 for a malformed one", async () => {
    const unknown = await request(app).post(
      `/api/v1/tasks/${randomUUID()}/complete`,
    );
    const malformed = await request(app).post(
      "/api/v1/tasks/not-a-uuid/complete",
    );

    expect(unknown.status).toBe(404);
    expect(malformed.status).toBe(400);
  });

  it("rejects a request body", async () => {
    const created = await createTask({ title: "Bodyless complete" });

    const response = await request(app)
      .post(`/api/v1/tasks/${created.body.id}/complete`)
      .send({ unexpected: "field" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("does not affect other tasks", async () => {
    const target = await createTask({ title: "Target" });
    const other = await createTask({ title: "Other" });

    await request(app).post(`/api/v1/tasks/${target.body.id}/complete`);

    const untouched = await request(app).get(`/api/v1/tasks/${other.body.id}`);

    expect(untouched.body.status).toBe("todo");
    expect(untouched.body.completedAt).toBeNull();
  });

  it("keeps completed tasks visible by default and under the filter", async () => {
    const created = await createTask({ title: "Visible" });
    await request(app).post(`/api/v1/tasks/${created.body.id}/complete`);

    const all = await request(app).get("/api/v1/tasks");
    const completed = await request(app).get("/api/v1/tasks?status=completed");

    expect(all.body.total).toBe(1);
    expect(completed.body.total).toBe(1);
    expect(completed.body.items[0].status).toBe("completed");
  });
});

describe("search semantics", () => {
  it("matches non-ASCII case pairs", async () => {
    await createTask({ title: "Café run" });

    const upper = await request(app).get("/api/v1/tasks?q=CAF%C3%89");
    const lower = await request(app).get("/api/v1/tasks?q=caf%C3%A9");

    expect(upper.body.total).toBe(1);
    expect(lower.body.total).toBe(1);
  });

  it("treats LIKE metacharacters literally", async () => {
    await createTask({ title: "100% complete" });
    await createTask({ title: "snake_case" });
    await createTask({ title: "back\\slash" });
    await createTask({ title: "unrelated" });

    const percent = await request(app).get("/api/v1/tasks?q=%25");
    const underscore = await request(app).get("/api/v1/tasks?q=_");
    const backslash = await request(app).get("/api/v1/tasks?q=%5C");

    expect(
      percent.body.items.map((task: { title: string }) => task.title),
    ).toEqual(["100% complete"]);
    expect(underscore.body.total).toBe(1);
    expect(backslash.body.total).toBe(1);
  });

  it("does not match across the title/description boundary", async () => {
    await createTask({ title: "alpha", description: "beta" });
    await createTask({ title: "alpha\nbeta", description: "" });

    const response = await request(app).get(
      `/api/v1/tasks?q=${encodeURIComponent("alpha\nbeta")}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items[0].title).toBe("alpha\nbeta");
  });

  it("returns an empty list when nothing matches", async () => {
    await createTask({ title: "Something" });

    const response = await request(app).get("/api/v1/tasks?q=nothinghere");

    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([]);
    expect(response.body.total).toBe(0);
  });

  it.each(["q=", "q=+++", "q=%20%20"])(
    "treats %s as omitted",
    async (query) => {
      await createTask({ title: "Alpha" });
      await createTask({ title: "Beta" });

      const response = await request(app).get(`/api/v1/tasks?${query}`);

      expect(response.body.total).toBe(2);
    },
  );

  it("rejects a q over 200 code points", async () => {
    const response = await request(app).get(
      `/api/v1/tasks?q=${"é".repeat(201)}`,
    );

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("paginates the combined search and filter result", async () => {
    for (const title of ["Task one", "Task two", "Task three"]) {
      await createTask({ title });
    }
    const completedId = (await createTask({ title: "Task four" })).body
      .id as string;
    await request(app).post(`/api/v1/tasks/${completedId}/complete`);

    const response = await request(app).get(
      "/api/v1/tasks?q=task&status=todo&limit=1&page=2",
    );

    expect(response.body.total).toBe(3);
    expect(response.body.items).toHaveLength(1);
  });

  it("finds completed tasks by default", async () => {
    const created = await createTask({ title: "Searchable done" });
    await request(app).post(`/api/v1/tasks/${created.body.id}/complete`);

    const response = await request(app).get("/api/v1/tasks?q=searchable");

    expect(response.body.total).toBe(1);
    expect(response.body.items[0].status).toBe("completed");
  });
});
