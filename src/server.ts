import { createApp } from "./app.js";
import { isLoopbackHost, loadConfig } from "./config.js";
import { closeDatabase, openDatabase } from "./db/connection.js";
import { migrate } from "./db/migrations.js";
import { SqliteTaskRepository } from "./db/sqlite-task-repository.js";
import { createLogger } from "./middleware/request-logger.js";

function start(): void {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  const database = openDatabase(config.databasePath);
  migrate(database);

  const repository = new SqliteTaskRepository(database);
  const app = createApp({ repository, logger });

  const server = app.listen(config.port, config.host, () => {
    logger.info(
      {
        url: `http://${config.host}:${config.port}`,
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
}

start();
