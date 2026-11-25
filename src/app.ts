import express, { type Express, type RequestHandler } from "express";
import type { Logger } from "pino";

import { AppError } from "./errors.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { requestLogger } from "./middleware/request-logger.js";
import type { TaskRepository } from "./repositories/task-repository.js";
import { createHealthRouter } from "./routes/health.js";
import { createTaskRouter } from "./routes/tasks.js";
import { createTaskService } from "./services/tasks.js";

export interface AppDependencies {
  readonly repository: TaskRepository;
  readonly logger: Logger;
  /** Runs the storage probe; throws when PostgreSQL is unavailable. */
  readonly healthCheck: () => void | Promise<void>;
}

/** Writes with a body must be JSON; bodyless actions such as `/complete` are exempt. */
function requireJsonContentType(): RequestHandler {
  return (request, _response, next) => {
    const contentLength = request.headers["content-length"];
    const hasBody =
      (contentLength !== undefined && contentLength !== "0") ||
      request.headers["transfer-encoding"] !== undefined;

    if (!hasBody) {
      next();
      return;
    }

    if (request.is("application/json")) {
      next();
      return;
    }

    next(
      new AppError(
        "UNSUPPORTED_MEDIA_TYPE",
        "Content-Type must be application/json",
      ),
    );
  };
}

/**
 * Build the Express app from injected dependencies. Never opens a port and
 * never touches the database directly.
 */
export function createApp({
  repository,
  logger,
  healthCheck,
}: AppDependencies): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(requestLogger(logger));

  app.use((request, response, next) => {
    if (request.method === "POST" || request.method === "PATCH") {
      requireJsonContentType()(request, response, next);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "100kb", strict: true }));

  app.use("/healthz", createHealthRouter(healthCheck));

  const service = createTaskService(repository);
  app.use("/api/v1/tasks", createTaskRouter(service));

  app.use(notFoundHandler());
  app.use(errorHandler(logger));

  return app;
}
