import { ZodError } from "zod";
import type { ErrorRequestHandler, RequestHandler } from "express";
import type { Logger } from "pino";

import { AppError, ERROR_STATUS, type ErrorCode } from "../errors.js";
import { getRequestId } from "./request-logger.js";

type BodyParserError = Error & {
  type?: string;
  status?: number;
  statusCode?: number;
};

type DatabaseFailure = Error & { code?: string };

const STORAGE_UNAVAILABLE_CODES = new Set([
  "57P03", // cannot_connect_now
  "57P01", // admin_shutdown
  "57P02", // crash_shutdown
  "08000", // connection_exception
  "08001", // sqlclient_unable_to_establish_sqlconnection
  "08003", // connection_does_not_exist
  "08004", // sqlserver_rejected_establishment_of_sqlconnection
  "08006", // connection_failure
  "53300", // too_many_connections
  "40001", // serialization_failure
  "40P01", // deadlock_detected
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
]);

function isBodyParserError(error: unknown): error is BodyParserError {
  return (
    error instanceof Error &&
    typeof (error as BodyParserError).type === "string" &&
    typeof (error as BodyParserError).status === "number"
  );
}

function databaseCode(error: unknown): string | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }
  return (error as DatabaseFailure).code;
}

function sendError(
  status: number,
  code: ErrorCode,
  message: string,
  details?: readonly { path: string; message: string }[],
): { status: number; body: unknown } {
  return {
    status,
    body: {
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
    },
  };
}

type Failure = {
  status: number;
  code: ErrorCode;
  message: string;
  details?: readonly { path: string; message: string }[];
};

function toFailure(error: unknown): Failure {
  if (error instanceof ZodError) {
    const details = error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    return {
      status: ERROR_STATUS.VALIDATION_ERROR,
      code: "VALIDATION_ERROR",
      message: "Invalid request",
      details,
    };
  }

  if (error instanceof AppError) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }

  if (isBodyParserError(error)) {
    if (error.type === "entity.too.large") {
      return {
        status: ERROR_STATUS.PAYLOAD_TOO_LARGE,
        code: "PAYLOAD_TOO_LARGE",
        message: "Request body is too large",
      };
    }
    if (
      error.type === "charset.unsupported" ||
      error.type === "encoding.unsupported"
    ) {
      return {
        status: ERROR_STATUS.UNSUPPORTED_MEDIA_TYPE,
        code: "UNSUPPORTED_MEDIA_TYPE",
        message: "Unsupported request encoding",
      };
    }
    if (error.type === "entity.parse.failed") {
      return {
        status: ERROR_STATUS.VALIDATION_ERROR,
        code: "VALIDATION_ERROR",
        message: "Malformed JSON body",
      };
    }
  }

  const code = databaseCode(error);

  if (code === "23505" || code === "23503") {
    return {
      status: ERROR_STATUS.CONFLICT,
      code: "CONFLICT",
      message: "Resource conflict",
    };
  }

  if (code === "22P02" || code === "22001" || code === "22007" || code === "22008") {
    return {
      status: ERROR_STATUS.VALIDATION_ERROR,
      code: "VALIDATION_ERROR",
      message: "Invalid request value",
    };
  }

  if (code !== undefined && STORAGE_UNAVAILABLE_CODES.has(code)) {
    return {
      status: ERROR_STATUS.STORAGE_UNAVAILABLE,
      code: "STORAGE_UNAVAILABLE",
      message: "Storage is unavailable",
    };
  }

  return {
    status: ERROR_STATUS.INTERNAL_ERROR,
    code: "INTERNAL_ERROR",
    message: "Unexpected error",
  };
}

/** The only place that writes an error response. */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error, _request, response, _next) => {
    if (response.headersSent) {
      logger.error(
        { requestId: getRequestId(response), err: error },
        "request failed after headers were sent",
      );
      response.destroy();
      return;
    }

    const failure = toFailure(error);
    const requestId = getRequestId(response);

    if (failure.status >= 500) {
      logger.error({ requestId, err: error }, "request failed");
    } else {
      logger.warn(
        { requestId, code: failure.code, status: failure.status },
        "request rejected",
      );
    }

    const { status, body } = sendError(
      failure.status,
      failure.code,
      failure.message,
      failure.details,
    );
    response.status(status).json(body);
  };
}

export function notFoundHandler(): RequestHandler {
  return (_request, _response, next) => {
    next(new AppError("NOT_FOUND", "Route not found"));
  };
}
