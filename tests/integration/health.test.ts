import { DatabaseSync } from "node:sqlite";

import type { Express } from "express";
import { pino } from "pino";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../../src/app.js";
import { migrate } from "../../src/db/migrations.js";
import { SqliteTaskRepository } from "../../src/db/sqlite-task-repository.js";

const logger = pino({ level: "silent" });

let database: DatabaseSync;
let app: Express;

beforeEach(() => {
  database = new DatabaseSync(":memory:");
  migrate(database);
  app = createApp({
    repository: new SqliteTaskRepository(database),
    logger,
    healthCheck: () => {
      database.prepare("SELECT 1").get();
    },
  });
});

afterEach(() => {
  database.close();
});

describe("GET /healthz", () => {
  it("reports ok when storage responds", async () => {
    const response = await request(app).get("/healthz");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
    expect(response.headers["x-request-id"]).toBeTypeOf("string");
  });

  it("returns 503 when the storage probe fails", async () => {
    const failingApp = createApp({
      repository: new SqliteTaskRepository(database),
      logger,
      healthCheck: () => {
        throw new Error("disk gone");
      },
    });

    const response = await request(failingApp).get("/healthz");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: {
        code: "STORAGE_UNAVAILABLE",
        message: "Storage is unavailable",
      },
    });
  });

  it("is unversioned", async () => {
    const response = await request(app).get("/api/v1/healthz");

    expect(response.status).toBe(404);
  });
});
