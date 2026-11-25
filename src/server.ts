import type { Server } from "node:http";

import { createApp } from "./app.js";
import { isLoopbackHost, loadConfig } from "./config.js";
import {
  checkDatabase,
  closeDatabase,
  createDatabasePool,
} from "./db/connection.js";
import { migrate } from "./db/migrations.js";
import { PostgresTaskRepository } from "./db/postgres-task-repository.js";
import { createLogger } from "./middleware/request-logger.js";
import { shutdown } from "./shutdown.js";

async function start(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  const pool = createDatabasePool({
    connectionString: config.databaseUrl,
    ssl: config.databaseSsl,
    max: config.databasePoolMax,
  });

  pool.on("error", (error) => {
    logger.error({ err: error }, "idle PostgreSQL client failed");
  });

  let server: Server;
  try {
    await migrate(pool);

    const repository = new PostgresTaskRepository(pool);
    const app = createApp({
      repository,
      logger,
      healthCheck: () => checkDatabase(pool),
    });

    server = app.listen(config.port, config.host, () => {
      const address = server.address();
      const port =
        typeof address === "object" && address !== null
          ? address.port
          : config.port;

      logger.info(
        {
          url: `http://${config.host}:${port}`,
          nodeEnv: config.nodeEnv,
          database: redactDatabaseUrl(config.databaseUrl),
        },
        "listening",
      );

      if (!isLoopbackHost(config.host)) {
        logger.warn(
          { host: config.host },
          "API is bound to a non-loopback host and has no authentication",
        );
      }
    });
  } catch (error) {
    await closeDatabase(pool);
    throw error;
  }

  server.on("error", (error) => {
    logger.error({ err: error }, "server failed");
    void closeDatabase(pool);
    process.exitCode = 1;
  });

  let shuttingDown = false;

  const stop = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    logger.info({ signal }, "shutdown requested");

    shutdown({ server, database: pool, logger })
      .then(() => {
        process.exitCode = 0;
      })
      .catch((error: unknown) => {
        logger.error({ err: error }, "shutdown failed");
        process.exitCode = 1;
      });
  };

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      stop(signal);
    });
  }
}

/** Never log database credentials. */
function redactDatabaseUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.password) {
      url.password = "***";
    }
    return url.toString();
  } catch {
    return "(unparseable database URL)";
  }
}

start().catch((error: unknown) => {
  // Config may be invalid, so build a logger without it.
  const logger = createLogger("info");
  logger.fatal({ err: error }, "startup failed");
  process.exitCode = 1;
});
