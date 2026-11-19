export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "STORAGE_UNAVAILABLE"
  | "INTERNAL_ERROR";

export const ERROR_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  STORAGE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

export type ValidationDetail = {
  readonly path: string;
  readonly message: string;
};

/**
 * Transport-agnostic application error. Middleware maps `code` to an HTTP
 * status and the standard envelope; nothing here knows about Express.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details?: readonly ValidationDetail[];
  override readonly cause?: unknown;

  constructor(
    code: ErrorCode,
    message: string,
    options: {
      details?: readonly ValidationDetail[];
      cause?: unknown;
    } = {},
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = options.details;
    this.cause = options.cause;
  }

  get status(): number {
    return ERROR_STATUS[this.code];
  }

  static notFound(message = "Task not found"): AppError {
    return new AppError("NOT_FOUND", message);
  }

  static validation(
    message = "Invalid request",
    details?: readonly ValidationDetail[],
  ): AppError {
    return new AppError("VALIDATION_ERROR", message, { details });
  }

  static storageUnavailable(
    message = "Storage is unavailable",
    cause?: unknown,
  ): AppError {
    return new AppError("STORAGE_UNAVAILABLE", message, { cause });
  }
}
