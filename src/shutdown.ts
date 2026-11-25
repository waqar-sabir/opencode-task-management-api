import type { Server } from "node:http";

import type { Logger } from "pino";
import type { Pool } from "pg";

import { closeDatabase } from "./db/connection.js";

export interface ShutdownOptions {
  readonly server: Server;
  readonly database: Pool;
  readonly logger: Logger;
  /** How long to wait for in-flight requests before forcing sockets closed. */
  readonly timeoutMs?: number;
}

/**
 * Stop accepting connections, drain in-flight requests, then close the pool.
 * The pool is always closed, even if the HTTP close reports an error.
 */
export async function shutdown({
  server,
  database,
  logger,
  timeoutMs = 5000,
}: ShutdownOptions): Promise<void> {
  logger.info("shutdown started");

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        logger.warn("forcing open connections closed");
        server.closeAllConnections();
      }, timeoutMs);
      timer.unref();

      server.close((error) => {
        clearTimeout(timer);
        if (
          error &&
          (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING"
        ) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  } finally {
    await closeDatabase(database);
  }

  logger.info("shutdown complete");
}
