import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import type { Task } from "./api/types";
import {
  COMPLETED_TASK,
  TODO_TASK,
  errorResponse,
  jsonResponse,
  makeTask,
} from "./test/fixtures";

interface MockApi {
  readonly fetchMock: ReturnType<typeof vi.fn>;
  readonly tasks: Task[];
}

function installApi(
  initialTasks: Task[] = [TODO_TASK, COMPLETED_TASK],
): MockApi {
  const tasks = [...initialTasks];

  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = new URL(String(input), "http://localhost");
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.pathname === "/healthz") {
        return jsonResponse({ status: "ok" });
      }

      if (url.pathname === "/api/v1/tasks" && method === "GET") {
        const status = url.searchParams.get("status");
        const limit = Number(url.searchParams.get("limit") ?? "20");
        const filtered = status
          ? tasks.filter((task) => task.status === status)
          : tasks;
        return jsonResponse({
          items: filtered.slice(0, limit),
          page: 1,
          limit,
          total: filtered.length,
        });
      }

      if (url.pathname === "/api/v1/tasks" && method === "POST") {
        const body = JSON.parse(String(init?.body)) as {
          title: string;
          description: string;
        };
        const created = makeTask({
          id: `created-${tasks.length + 1}`,
          title: body.title,
          description: body.description,
          createdAt: "2026-11-22T12:00:00.000Z",
          updatedAt: "2026-11-22T12:00:00.000Z",
        });
        tasks.unshift(created);
        return jsonResponse(created, 201);
      }

      const completeMatch = url.pathname.match(
        /^\/api\/v1\/tasks\/([^/]+)\/complete$/,
      );
      const completeId = completeMatch?.[1];
      if (completeId && method === "POST") {
        const index = tasks.findIndex((task) => task.id === completeId);
        const current = tasks[index];
        if (!current) {
          return errorResponse(404, "NOT_FOUND", "Task not found");
        }
        const completed: Task = {
          ...current,
          status: "completed",
          completedAt: "2026-11-22T12:00:00.000Z",
          updatedAt: "2026-11-22T12:00:00.000Z",
        };
        tasks[index] = completed;
        return jsonResponse(completed);
      }

      const taskMatch = url.pathname.match(/^\/api\/v1\/tasks\/([^/]+)$/);
      const taskId = taskMatch?.[1];
      if (taskId && method === "DELETE") {
        const index = tasks.findIndex((task) => task.id === taskId);
        if (index === -1) {
          return errorResponse(404, "NOT_FOUND", "Task not found");
        }
        tasks.splice(index, 1);
        return new Response(null, { status: 204 });
      }

      if (taskId && method === "PATCH") {
        const index = tasks.findIndex((task) => task.id === taskId);
        const current = tasks[index];
        if (!current) {
          return errorResponse(404, "NOT_FOUND", "Task not found");
        }
        const body = JSON.parse(String(init?.body)) as Partial<Task>;
        const updated: Task = { ...current, ...body };
        tasks[index] = updated;
        return jsonResponse(updated);
      }

      return errorResponse(404, "NOT_FOUND", "Unknown route");
    },
  );

  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, tasks };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("renders tasks, totals, and API health", async () => {
    installApi();

    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Your tasks, at a glance" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Prepare release notes"),
    ).toBeInTheDocument();
    expect(screen.getByText("Publish the dashboard")).toBeInTheDocument();
    expect(await screen.findByText("API online")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Task list" }),
    ).toBeInTheDocument();
  });

  it("filters the list by status", async () => {
    const { fetchMock } = installApi();
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("Prepare release notes");

    const statusGroup = screen.getByRole("group", { name: "Filter by status" });
    await user.click(
      within(statusGroup).getByRole("button", { name: /To do/ }),
    );

    await waitFor(() => {
      expect(
        screen.queryByText("Publish the dashboard"),
      ).not.toBeInTheDocument();
    });
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes("status=todo"),
      ),
    ).toBe(true);
  });

  it("creates a task and refreshes the list", async () => {
    const { tasks } = installApi();
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("Prepare release notes");

    await user.click(screen.getByRole("button", { name: /New task/ }));
    expect(
      screen.getByRole("heading", { name: "Create a task" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveFocus();

    await user.type(screen.getByLabelText("Title"), "Ship the dashboard");
    await user.type(
      screen.getByLabelText(/Description/),
      "Wire it to the local API.",
    );
    await user.click(screen.getByRole("button", { name: "Create task" }));

    expect(await screen.findByText("Task created.")).toBeInTheDocument();
    expect(await screen.findByText("Ship the dashboard")).toBeInTheDocument();
    expect(tasks[0]?.title).toBe("Ship the dashboard");
  });

  it("completes a task and keeps it visible", async () => {
    installApi();
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("Prepare release notes");

    await user.click(
      screen.getByRole("button", {
        name: "Mark “Prepare release notes” complete",
      }),
    );

    expect(
      await screen.findByText("Completed “Prepare release notes”."),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.queryByRole("button", {
          name: "Mark “Prepare release notes” complete",
        }),
      ).not.toBeInTheDocument();
    });
  });

  it("validates an empty title and restores focus when Escape closes the dialog", async () => {
    const { fetchMock } = installApi();
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("Prepare release notes");

    await user.click(screen.getByRole("button", { name: /New task/ }));
    await user.click(screen.getByRole("button", { name: "Create task" }));

    expect(await screen.findByText("Title is required.")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(0);

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: "Create a task" }),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /New task/ })).toHaveFocus();
  });

  it("deletes a task after confirmation", async () => {
    installApi();
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("Prepare release notes");

    await user.click(
      screen.getByRole("button", {
        name: "Delete “Prepare release notes”",
      }),
    );
    expect(
      screen.getByRole("heading", { name: "Delete this task?" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Delete task" }));

    expect(
      await screen.findByText("Deleted “Prepare release notes”."),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.queryByText("Prepare release notes"),
      ).not.toBeInTheDocument();
    });
  });

  it("shows the API error envelope when the list request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), "http://localhost");
        if (url.pathname === "/healthz") {
          return jsonResponse({ status: "ok" });
        }
        throw new TypeError("Failed to fetch");
      }),
    );

    render(<App />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Cannot reach the task API");
    expect(within(alert).getByText("NETWORK_ERROR")).toBeInTheDocument();
    expect(
      within(alert).getByRole("button", { name: /Retry/ }),
    ).toBeInTheDocument();
  });
});
