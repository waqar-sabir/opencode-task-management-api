import type { Express } from "express";
import { pino } from "pino";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../../src/app.js";
import { checkDatabase } from "../../src/db/connection.js";
import { PostgresTaskRepository } from "../../src/db/postgres-task-repository.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../helpers/database.js";

const logger = pino({ level: "silent" });

let database: TestDatabase;
let app: Express;

beforeEach(async () => {
  database = await createTestDatabase();
  app = createApp({
    repository: new PostgresTaskRepository(database.pool),
    logger,
    healthCheck: () => checkDatabase(database.pool),
  });
});

afterEach(async () => {
  await database.close();
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
      repository: new PostgresTaskRepository(database.pool),
      logger,
      healthCheck: () => {
        throw new Error("database gone");
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
