import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  CreateTaskRecord,
  Task,
  TaskRepository,
} from "../../../src/repositories/task-repository.js";
import { createTaskService } from "../../../src/services/tasks.js";

const NOW = "2026-11-19T10:00:00.000Z";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "0f6a4a3e-1f2b-4a3c-9d4e-5f6a7b8c9d0e",
    title: "Task",
    description: "",
    status: "todo",
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: null,
    ...overrides,
  };
}

function fakeRepository(
  overrides: Partial<TaskRepository> = {},
): TaskRepository {
  return {
    create: vi.fn(async (input: CreateTaskRecord) =>
      task({
        id: input.id,
        title: input.title,
        description: input.description,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      }),
    ),
    findById: vi.fn(async () => null),
    list: vi.fn(async () => ({ items: [], total: 0 })),
    updateContent: vi.fn(async () => null),
    delete: vi.fn(async () => false),
    complete: vi.fn(async () => null),
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createTask", () => {
  it("generates a UUID and identical timestamps", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    const repository = fakeRepository();
    const service = createTaskService(repository);

    const created = await service.createTask({
      title: "Prepare notes",
      description: "",
    });

    expect(created.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(created.createdAt).toBe(NOW);
    expect(created.updatedAt).toBe(NOW);
    expect(repository.create).toHaveBeenCalledWith({
      id: created.id,
      title: "Prepare notes",
      description: "",
      createdAt: NOW,
      updatedAt: NOW,
    });
  });
});

describe("getTask", () => {
  it("returns the stored task", async () => {
    const repository = fakeRepository({
      findById: vi.fn(async () => task({ title: "Found" })),
    });

    await expect(
      createTaskService(repository).getTask("id"),
    ).resolves.toMatchObject({ title: "Found" });
  });

  it("throws NOT_FOUND for a missing task", async () => {
    const service = createTaskService(fakeRepository());

    await expect(service.getTask("id")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("listTasks", () => {
  it("delegates to the repository", async () => {
    const page = { items: [task()], total: 1 };
    const repository = fakeRepository({ list: vi.fn(async () => page) });
    const query = {
      page: 1,
      limit: 20,
      sort: "createdAt" as const,
      order: "desc" as const,
    };

    await expect(createTaskService(repository).listTasks(query)).resolves.toBe(
      page,
    );
    expect(repository.list).toHaveBeenCalledWith(query);
  });
});

describe("updateTask", () => {
  it("passes the current time and returns the updated task", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    const repository = fakeRepository({
      updateContent: vi.fn(async () => task({ title: "Updated" })),
    });

    const updated = await createTaskService(repository).updateTask("id", {
      title: "Updated",
    });

    expect(updated.title).toBe("Updated");
    expect(repository.updateContent).toHaveBeenCalledWith(
      "id",
      { title: "Updated" },
      NOW,
    );
  });

  it("throws NOT_FOUND when nothing was updated", async () => {
    const service = createTaskService(fakeRepository());

    await expect(
      service.updateTask("id", { title: "Updated" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("deleteTask", () => {
  it("resolves when a row was deleted", async () => {
    const repository = fakeRepository({ delete: vi.fn(async () => true) });

    await expect(
      createTaskService(repository).deleteTask("id"),
    ).resolves.toBeUndefined();
  });

  it("throws NOT_FOUND when no row was deleted", async () => {
    const service = createTaskService(fakeRepository());

    await expect(service.deleteTask("id")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("completeTask", () => {
  it("passes the current time and returns the completed task", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    const repository = fakeRepository({
      complete: vi.fn(async () =>
        task({ status: "completed", completedAt: NOW }),
      ),
    });

    const completed = await createTaskService(repository).completeTask("id");

    expect(completed.status).toBe("completed");
    expect(repository.complete).toHaveBeenCalledWith("id", NOW);
  });

  it("throws NOT_FOUND for a missing task", async () => {
    const service = createTaskService(fakeRepository());

    await expect(service.completeTask("id")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
