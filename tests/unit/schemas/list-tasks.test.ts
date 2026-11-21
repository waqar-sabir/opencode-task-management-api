import { describe, expect, it } from "vitest";

import { listTasksQuerySchema } from "../../../src/schemas/list-tasks.js";

describe("listTasksQuerySchema", () => {
  it("applies defaults", () => {
    expect(listTasksQuerySchema.parse({})).toEqual({
      page: 1,
      limit: 20,
      sort: "createdAt",
      order: "desc",
    });
  });

  it("trims q", () => {
    expect(listTasksQuerySchema.parse({ q: "  release  " }).q).toBe("release");
  });

  it("enforces the q code-point limit", () => {
    expect(() =>
      listTasksQuerySchema.parse({ q: "😀".repeat(200) }),
    ).not.toThrow();
    expect(() => listTasksQuerySchema.parse({ q: "😀".repeat(201) })).toThrow();
  });

  it.each([
    { page: "0" },
    { page: "1.5" },
    { page: "1e1" },
    { page: "01" },
    { page: "+1" },
    { page: " 1" },
    { limit: "0" },
    { limit: "101" },
    { limit: "1e1" },
    { limit: " 1" },
  ])("rejects non-canonical paging %o", (query) => {
    expect(() => listTasksQuerySchema.parse(query)).toThrow();
  });

  it("accepts the maximum limit", () => {
    expect(listTasksQuerySchema.parse({ limit: "100" }).limit).toBe(100);
  });

  it("rejects unknown fields and repeated values", () => {
    expect(() => listTasksQuerySchema.parse({ owner: "me" })).toThrow();
    expect(() =>
      listTasksQuerySchema.parse({ status: ["todo", "completed"] }),
    ).toThrow();
    expect(() => listTasksQuerySchema.parse({ page: ["1", "2"] })).toThrow();
  });

  it("rejects invalid sort and order values", () => {
    expect(() => listTasksQuerySchema.parse({ sort: "created" })).toThrow();
    expect(() => listTasksQuerySchema.parse({ order: "DESC" })).toThrow();
  });
});
