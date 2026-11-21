import { ApiError } from "./client";

/** Normalize anything thrown by a request into an `ApiError`. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof Error) {
    return new ApiError(0, "UNEXPECTED_ERROR", error.message);
  }
  return new ApiError(0, "UNEXPECTED_ERROR", "An unexpected error occurred.");
}

export { ApiError };
