import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  checkHealth,
  completeTask,
  createTask,
  deleteTask,
  getTaskCounts,
  listTasks,
  updateTask,
} from "./client";
import { errorResponse, jsonResponse, makeTask } from "../test/fixtures";

function mockFetch(
  implementation: (input: RequestInfo | URL, init?: RequestInit) => Response,
) {
  const fetchMock = vi.fn(implementation);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("listTasks", () => {
  it("serializes filters and pagination into the query string", async () => {
    const fetchMock = mockFetch(() =>
      jsonResponse({ items: [], page: 2, limit: 10, total: 0 }),
    );

    await listTasks({
      q: "  release ",
      status: "todo",
      page: 2,
      limit: 10,
      sort: "title",
      order: "asc",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/tasks?q=release&status=todo&page=2&limit=10&sort=title&order=asc",
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: "application/json" }),
      }),
    );
  });

  it("omits a blank search and the all-status filter", async () => {
    const fetchMock = mockFetch(() =>
      jsonResponse({ items: [], page: 1, limit: 20, total: 0 }),
    );

    await listTasks({ q: "   ", status: "all", page: 1, limit: 20 });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/tasks?page=1&limit=20",
      expect.any(Object),
    );
  });

  it("surfaces the API error envelope as an ApiError", async () => {
    mockFetch(() =>
      errorResponse(400, "VALIDATION_ERROR", "Invalid request", [
        { path: "limit", message: "Must be at most 100" },
      ]),
    );

    await expect(listTasks({ limit: 101 })).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid request",
      details: [{ path: "limit", message: "Must be at most 100" }],
    });
  });

  it("maps a transport failure to a network ApiError", async () => {
    mockFetch(() => {
      throw new TypeError("Failed to fetch");
    });

    const error = await listTasks().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 0, code: "NETWORK_ERROR" });
  });
});

describe("task mutations", () => {
  it("creates a task with a JSON body", async () => {
    const created = makeTask();
    const fetchMock = mockFetch(() => jsonResponse(created, 201));

    await createTask({ title: "Prepare release notes", description: "Cover." });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/tasks",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          title: "Prepare release notes",
          description: "Cover.",
        }),
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("sends only the changed fields on update", async () => {
    const fetchMock = mockFetch(() => jsonResponse(makeTask()));

    await updateTask("task id", { title: "New title" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/tasks/task%20id",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ title: "New title" }),
      }),
    );
  });

  it("completes a task with a bodyless POST", async () => {
    const fetchMock = mockFetch(() =>
      jsonResponse(makeTask({ status: "completed" })),
    );

    await completeTask("abc");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/tasks/abc/complete",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("accepts the 204 response from delete", async () => {
    const fetchMock = mockFetch(() => new Response(null, { status: 204 }));

    await expect(deleteTask("abc")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/tasks/abc",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});

describe("dashboard aggregates", () => {
  it("derives counts from three limit=1 list calls", async () => {
    const fetchMock = mockFetch((input) => {
      const url = new URL(String(input), "http://localhost");
      const status = url.searchParams.get("status");
      const total = status === "todo" ? 3 : status === "completed" ? 5 : 8;
      return jsonResponse({ items: [], page: 1, limit: 1, total });
    });

    await expect(getTaskCounts()).resolves.toEqual({
      total: 8,
      todo: 3,
      completed: 5,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("reports health from /healthz", async () => {
    mockFetch(() => jsonResponse({ status: "ok" }));
    await expect(checkHealth()).resolves.toBe(true);

    mockFetch(() => errorResponse(503, "STORAGE_UNAVAILABLE", "Down"));
    await expect(checkHealth()).resolves.toBe(false);
  });

  it("treats an unreachable health endpoint as offline", async () => {
    mockFetch(() => {
      throw new TypeError("Failed to fetch");
    });

    await expect(checkHealth()).resolves.toBe(false);
  });
});
