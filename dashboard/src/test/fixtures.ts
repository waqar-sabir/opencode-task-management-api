import type { Task } from "../api/types";

export const TODO_TASK: Task = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Prepare release notes",
  description: "Cover the API changes.",
  status: "todo",
  createdAt: "2026-11-20T10:00:00.000Z",
  updatedAt: "2026-11-20T10:00:00.000Z",
  completedAt: null,
};

export const COMPLETED_TASK: Task = {
  id: "22222222-2222-4222-8222-222222222222",
  title: "Publish the dashboard",
  description: "",
  status: "completed",
  createdAt: "2026-11-19T09:00:00.000Z",
  updatedAt: "2026-11-19T12:00:00.000Z",
  completedAt: "2026-11-19T12:00:00.000Z",
};

export function makeTask(overrides: Partial<Task> = {}): Task {
  return { ...TODO_TASK, ...overrides };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: readonly { path: string; message: string }[],
): Response {
  return jsonResponse({ error: { code, message, details } }, status);
}
