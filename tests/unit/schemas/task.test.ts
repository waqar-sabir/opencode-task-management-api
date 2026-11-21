import { describe, expect, it } from "vitest";

import {
  codePointLength,
  createTaskSchema,
  taskIdSchema,
  updateTaskSchema,
} from "../../../src/schemas/task.js";

describe("createTaskSchema", () => {
  it("trims the title and defaults the description", () => {
    expect(createTaskSchema.parse({ title: "  Prepare notes  " })).toEqual({
      title: "Prepare notes",
      description: "",
    });
  });

  it("rejects a whitespace-only title", () => {
    expect(() => createTaskSchema.parse({ title: "   " })).toThrow();
  });

  it("rejects null values", () => {
    expect(() =>
      createTaskSchema.parse({ title: null, description: null }),
    ).toThrow();
  });

  it("counts title limits in code points", () => {
    expect(() =>
      createTaskSchema.parse({ title: "😀".repeat(200) }),
    ).not.toThrow();
    expect(() => createTaskSchema.parse({ title: "😀".repeat(201) })).toThrow();
  });

  it("counts description limits in code points", () => {
    expect(() =>
      createTaskSchema.parse({ title: "x", description: "😀".repeat(2000) }),
    ).not.toThrow();
    expect(() =>
      createTaskSchema.parse({ title: "x", description: "😀".repeat(2001) }),
    ).toThrow();
  });

  it("stores the description without trimming it", () => {
    const parsed = createTaskSchema.parse({
      title: "x",
      description: "  keep spaces  ",
    });

    expect(parsed.description).toBe("  keep spaces  ");
  });

  it("rejects unknown fields", () => {
    expect(() =>
      createTaskSchema.parse({ title: "x", status: "completed" }),
    ).toThrow();
  });
});

describe("updateTaskSchema", () => {
  it("accepts one or both content fields", () => {
    expect(updateTaskSchema.parse({ title: "x" })).toEqual({ title: "x" });
    expect(updateTaskSchema.parse({ description: "" })).toEqual({
      description: "",
    });
  });

  it("requires at least one content field", () => {
    expect(() => updateTaskSchema.parse({})).toThrow();
  });

  it("rejects protected and unknown fields", () => {
    for (const field of [
      "id",
      "status",
      "createdAt",
      "updatedAt",
      "completedAt",
      "owner",
    ]) {
      expect(() => updateTaskSchema.parse({ [field]: "value" })).toThrow();
    }
  });
});

describe("taskIdSchema", () => {
  it("accepts a UUID and rejects other strings", () => {
    expect(taskIdSchema.parse("0f6a4a3e-1f2b-4a3c-9d4e-5f6a7b8c9d0e")).toBe(
      "0f6a4a3e-1f2b-4a3c-9d4e-5f6a7b8c9d0e",
    );
    expect(() => taskIdSchema.parse("not-a-uuid")).toThrow();
  });
});

describe("codePointLength", () => {
  it("counts astral characters as one code point", () => {
    expect(codePointLength("😀")).toBe(1);
    expect("😀".length).toBe(2);
  });
});
