import { describe, expect, it } from "vitest";

import { toTask, type TaskRow } from "../../../src/db/row-mapper.js";

function row(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: "0f6a4a3e-1f2b-4a3c-9d4e-5f6a7b8c9d0e",
    title: "Prepare release notes",
    description: "Cover the API changes.",
    search_title: "prepare release notes",
    search_description: "cover the api changes.",
    status: "todo",
    created_at: "2026-11-19T10:00:00.000Z",
    updated_at: "2026-11-19T10:00:00.000Z",
    completed_at: null,
    ...overrides,
  };
}

describe("toTask", () => {
  it("maps snake_case columns to the domain shape", () => {
    expect(toTask(row())).toEqual({
      id: "0f6a4a3e-1f2b-4a3c-9d4e-5f6a7b8c9d0e",
      title: "Prepare release notes",
      description: "Cover the API changes.",
      status: "todo",
      createdAt: "2026-11-19T10:00:00.000Z",
      updatedAt: "2026-11-19T10:00:00.000Z",
      completedAt: null,
    });
  });

  it("never exposes search_text", () => {
    expect(toTask(row())).not.toHaveProperty("search_text");
  });

  it("maps a completed task", () => {
    const task = toTask(
      row({
        status: "completed",
        completed_at: "2026-11-19T11:00:00.000Z",
      }),
    );

    expect(task.status).toBe("completed");
    expect(task.completedAt).toBe("2026-11-19T11:00:00.000Z");
  });

  it("rejects an unknown status", () => {
    expect(() => toTask(row({ status: "archived" }))).toThrow(
      /Unexpected task status/,
    );
  });
});
