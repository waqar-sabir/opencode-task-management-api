import { describe, expect, it } from "vitest";

import { codePointLength, hasErrors, validateTaskForm } from "./validation";

describe("validateTaskForm", () => {
  it("requires a non-empty trimmed title", () => {
    expect(validateTaskForm({ title: "   ", description: "" })).toEqual({
      title: "Title is required.",
    });
  });

  it("accepts the title and description limits", () => {
    expect(
      validateTaskForm({
        title: "a".repeat(200),
        description: "b".repeat(2000),
      }),
    ).toEqual({});
  });

  it("rejects values over the limits", () => {
    const errors = validateTaskForm({
      title: "a".repeat(201),
      description: "b".repeat(2001),
    });

    expect(errors.title).toContain("200");
    expect(errors.description).toContain("2000");
    expect(hasErrors(errors)).toBe(true);
  });

  it("counts Unicode code points rather than UTF-16 units", () => {
    expect(codePointLength("🚀")).toBe(1);
    expect(codePointLength("café")).toBe(4);
    expect(
      validateTaskForm({ title: "🚀".repeat(200), description: "" }),
    ).toEqual({});
  });
});
