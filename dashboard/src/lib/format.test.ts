import { describe, expect, it } from "vitest";

import { completionRate, formatRelative, pluralize } from "./format";

describe("formatRelative", () => {
  const now = Date.parse("2026-11-22T12:00:00.000Z");

  it("describes recent times", () => {
    expect(formatRelative("2026-11-22T11:59:50.000Z", now)).toBe("just now");
    expect(formatRelative("2026-11-22T11:45:00.000Z", now)).toBe("15m ago");
    expect(formatRelative("2026-11-22T09:00:00.000Z", now)).toBe("3h ago");
    expect(formatRelative("2026-11-19T12:00:00.000Z", now)).toBe("3d ago");
  });

  it("falls back to a date after a week", () => {
    expect(formatRelative("2026-10-01T12:00:00.000Z", now)).not.toContain(
      "ago",
    );
  });

  it("handles invalid input", () => {
    expect(formatRelative("not-a-date", now)).toBe("Unknown");
  });
});

describe("completionRate", () => {
  it("rounds the completed share", () => {
    expect(completionRate(0, 0)).toBe(0);
    expect(completionRate(3, 1)).toBe(25);
    expect(completionRate(1, 2)).toBe(67);
  });
});

describe("pluralize", () => {
  it("uses the singular for one", () => {
    expect(pluralize(1, "task")).toBe("1 task");
    expect(pluralize(2, "task")).toBe("2 tasks");
    expect(pluralize(2, "matching task")).toBe("2 matching tasks");
  });
});
