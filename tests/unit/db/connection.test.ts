import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { closeDatabase, openDatabase } from "../../../src/db/connection.js";
import { migrate } from "../../../src/db/migrations.js";

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "task-api-connection-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("openDatabase", () => {
  it("opens an in-memory database without touching the filesystem", () => {
    const database = openDatabase(":memory:");

    expect(database.isOpen).toBe(true);
    expect(
      database.prepare("PRAGMA journal_mode").get() as { journal_mode: string },
    ).toMatchObject({ journal_mode: "memory" });

    closeDatabase(database);
    expect(database.isOpen).toBe(false);
  });

  it("creates missing parent directories with mode 0700 and the file with 0600", () => {
    const root = temporaryDirectory();
    const path = join(root, "nested", "tasks.db");

    const database = openDatabase(path);
    migrate(database);
    closeDatabase(database);

    if (process.platform !== "win32") {
      expect(statSync(join(root, "nested")).mode & 0o777).toBe(0o700);
      expect(statSync(path).mode & 0o777).toBe(0o600);
    }
  });

  it("leaves an existing directory's permissions alone", () => {
    const root = temporaryDirectory();
    const path = join(root, "tasks.db");

    const database = openDatabase(path);
    closeDatabase(database);

    if (process.platform !== "win32") {
      expect(statSync(root).mode & 0o777).toBe(0o700);
    }
  });

  it("fails fast on a file that is not a database", () => {
    const root = temporaryDirectory();
    const path = join(root, "corrupt.db");
    writeFileSync(path, "this is definitely not sqlite");

    expect(() => openDatabase(path)).toThrow();
  });

  it("tolerates a second close call", () => {
    const database = openDatabase(":memory:");
    closeDatabase(database);

    expect(() => closeDatabase(database)).not.toThrow();
  });
});
