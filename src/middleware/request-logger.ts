import { randomUUID } from "node:crypto";

import { pino, type Logger } from "pino";
import type { RequestHandler } from "express";

export function createLogger(level: string): Logger {
  return pino({
    level,
    base: { service: "task-management-api" },
  });
}

/** Request ID assignment plus one structured log line per completed request. */
export function requestLogger(logger: Logger): RequestHandler {
  return (request, response, next) => {
    const incoming = request.header("x-request-id");
    const trimmed = typeof incoming === "string" ? incoming.trim() : "";
    const requestId =
      trimmed.length > 0 && trimmed.length <= 128 ? trimmed : randomUUID();

    // Capture before routing strips the mount path; drop the query string
    // because it may contain user search text.
    const path = request.originalUrl.split("?")[0] ?? "/";

    (response.locals as { requestId?: string }).requestId = requestId;
    response.setHeader("X-Request-Id", requestId);

    const startedAt = process.hrtime.bigint();

    response.on("finish", () => {
      const durationMs =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;

      logger.info(
        {
          requestId,
          method: request.method,
          path,
          status: response.statusCode,
          durationMs: Number(durationMs.toFixed(3)),
        },
        "request",
      );
    });

    next();
  };
}

export function getRequestId(response: {
  locals: Record<string, unknown>;
}): string {
  const value = response.locals.requestId;
  return typeof value === "string" ? value : "unknown";
}
