import type { Server } from "node:http";

import { createApp } from "./app.js";
import { isLoopbackHost, loadConfig } from "./config.js";
import { closeDatabase, openDatabase } from "./db/connection.js";
import { migrate } from "./db/migrations.js";
import { SqliteTaskRepository } from "./db/sqlite-task-repository.js";
import { createLogger } from "./middleware/request-logger.js";
import { shutdown } from "./shutdown.js";

function start(): void {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  const database = openDatabase(config.databasePath);

  try {
    migrate(database);
  } catch (error) {
    closeDatabase(database);
    throw error;
  }

  const repository = new SqliteTaskRepository(database);
  const app = createApp({
    repository,
    logger,
    healthCheck: () => {
      database.prepare("SELECT 1").get();
    },
  });

  const server: Server = app.listen(config.port, config.host, () => {
    const address = server.address();
    const port =
      typeof address === "object" && address !== null
        ? address.port
        : config.port;

    logger.info(
      {
        url: `http://${config.host}:${port}`,
        nodeEnv: config.nodeEnv,
        databasePath: config.databasePath,
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

  server.on("error", (error) => {
    logger.error({ err: error }, "server failed");
    closeDatabase(database);
    process.exitCode = 1;
  });

  let shuttingDown = false;

  const stop = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    logger.info({ signal }, "shutdown requested");

    shutdown({ server, database, logger })
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

try {
  start();
} catch (error) {
  // Config may be invalid, so build a logger without it.
  const logger = createLogger("info");
  logger.fatal({ err: error }, "startup failed");
  process.exitCode = 1;
}
