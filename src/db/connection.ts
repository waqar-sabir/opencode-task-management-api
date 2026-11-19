import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const BUSY_TIMEOUT_MS = 5000;

/**
 * Open a SQLite database, create the parent directory if needed, and apply the
 * pragmas required by ARCHITECTURE.md §7.3.
 *
 * `:memory:` skips all filesystem work and is used by tests.
 */
export function openDatabase(databasePath: string): DatabaseSync {
  if (databasePath === ":memory:") {
    const database = new DatabaseSync(":memory:");
    configure(database);
    return database;
  }

  const resolvedPath = resolve(databasePath);
  const directory = dirname(resolvedPath);

  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (process.platform !== "win32") {
      // mkdir mode is masked by the process umask; enforce it explicitly.
      chmodSync(directory, 0o700);
    }
  }

  const database = new DatabaseSync(resolvedPath);
  configure(database);

  if (process.platform !== "win32") {
    chmodSync(resolvedPath, 0o600);
  }

  return database;
}

export function closeDatabase(database: DatabaseSync): void {
  if (database.isOpen) {
    database.close();
  }
}

function configure(database: DatabaseSync): void {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS};
  `);
}
