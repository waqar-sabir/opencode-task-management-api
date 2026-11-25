import type { Express } from "express";
import { pino } from "pino";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../../../src/app.js";
import type { TaskRepository } from "../../../src/repositories/task-repository.js";

const logger = pino({ level: "silent" });

type Failure = Error & { code?: string };

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

function databaseError(message: string, code: string): Failure {
  return Object.assign(new Error(message), { code });
}

describe("error handler", () => {
  it("maps a database that cannot connect to 503", async () => {
    const response = await request(
      appFailingWith(
        databaseError("the database system is starting up", "57P03"),
      ),
    ).get("/api/v1/tasks");

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("STORAGE_UNAVAILABLE");
  });

  it("maps a refused connection to 503", async () => {
    const response = await request(
      appFailingWith(databaseError("connect ECONNREFUSED", "ECONNREFUSED")),
    ).get("/api/v1/tasks");

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("STORAGE_UNAVAILABLE");
  });

  it("maps a serialization failure to 503", async () => {
    const response = await request(
      appFailingWith(databaseError("could not serialize access", "40001")),
    ).get("/api/v1/tasks");

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("STORAGE_UNAVAILABLE");
  });

  it("maps a unique violation to 409", async () => {
    const response = await request(
      appFailingWith(
        databaseError("duplicate key value violates unique constraint", "23505"),
      ),
    ).get("/api/v1/tasks");

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("CONFLICT");
  });

  it("maps an invalid input value to a validation error", async () => {
    const response = await request(
      appFailingWith(
        databaseError("invalid input syntax for type uuid", "22P02"),
      ),
    ).get("/api/v1/tasks");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("maps other database failures to a generic 500", async () => {
    const response = await request(
      appFailingWith(
        databaseError("new row violates check constraint", "23514"),
      ),
    ).get("/api/v1/tasks");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Unexpected error" },
    });
    expect(JSON.stringify(response.body)).not.toContain("check constraint");
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
