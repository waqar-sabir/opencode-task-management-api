import type { Express } from "express";
import { pino } from "pino";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../../../src/app.js";
import type { TaskRepository } from "../../../src/repositories/task-repository.js";

const logger = pino({ level: "silent" });

type Failure = Error & { code?: string; errcode?: number };

function repositoryThatFailsWith(error: unknown): TaskRepository {
  const failing = (() => {
    throw error;
  }) as unknown;

  return {
    create: failing as TaskRepository["create"],
    findById: failing as TaskRepository["findById"],
    list: failing as TaskRepository["list"],
    updateContent: failing as TaskRepository["updateContent"],
    delete: failing as TaskRepository["delete"],
    complete: failing as TaskRepository["complete"],
  };
}

function appFailingWith(error: unknown): Express {
  return createApp({
    repository: repositoryThatFailsWith(error),
    logger,
    healthCheck: () => undefined,
  });
}

function sqliteError(message: string, errcode: number): Failure {
  return Object.assign(new Error(message), {
    code: "ERR_SQLITE_ERROR",
    errcode,
  });
}

describe("error handler", () => {
  it("maps SQLITE_BUSY to 503", async () => {
    const response = await request(
      appFailingWith(sqliteError("database is locked", 5)),
    ).get("/api/v1/tasks");

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("STORAGE_UNAVAILABLE");
  });

  it("maps SQLITE_LOCKED to 503", async () => {
    const response = await request(
      appFailingWith(sqliteError("database table is locked", 6)),
    ).get("/api/v1/tasks");

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("STORAGE_UNAVAILABLE");
  });

  it("recognises a lock message without an errcode", async () => {
    const response = await request(
      appFailingWith(sqliteError("SQLITE_BUSY: database is locked", 0)),
    ).get("/api/v1/tasks");

    expect(response.status).toBe(503);
  });

  it("maps other SQLite failures to a generic 500", async () => {
    const response = await request(
      appFailingWith(sqliteError("no such column: secret_column", 1)),
    ).get("/api/v1/tasks");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Unexpected error" },
    });
    expect(JSON.stringify(response.body)).not.toContain("secret_column");
  });

  it("does not leak stack traces for unknown errors", async () => {
    const response = await request(
      appFailingWith(new Error("boom at /Users/someone/secret.ts:42")),
    ).get("/api/v1/tasks");

    expect(response.status).toBe(500);
    expect(response.body.error.message).toBe("Unexpected error");
    expect(JSON.stringify(response.body)).not.toContain("/Users/");
  });
});
