import type {
  CreateTaskInput,
  ListTasksParams,
  Task,
  TaskCounts,
  TaskPage,
  UpdateTaskInput,
  ValidationDetail,
} from "./types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "/api/v1").replace(
  /\/+$/,
  "",
);

const STATUS_MESSAGES: Record<number, string> = {
  400: "The request was rejected by the API.",
  404: "The task no longer exists.",
  413: "The request body is too large.",
  415: "The API requires JSON content.",
  503: "Storage is unavailable. Is the API still running?",
  500: "The API hit an unexpected error.",
};

/** A failed API call with the stable error envelope attached when present. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: readonly ValidationDetail[];

  constructor(
    status: number,
    code: string,
    message: string,
    details: readonly ValidationDetail[] = [],
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

interface ErrorEnvelope {
  error?: {
    code?: unknown;
    message?: unknown;
    details?: unknown;
  };
}

function isValidationDetail(value: unknown): value is ValidationDetail {
  if (typeof value !== "object" || value === null) return false;
  const detail = value as Record<string, unknown>;
  return typeof detail.path === "string" && typeof detail.message === "string";
}

function parseDetails(value: unknown): ValidationDetail[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isValidationDetail);
}

async function parseError(response: Response): Promise<ApiError> {
  let envelope: ErrorEnvelope | undefined;
  try {
    envelope = (await response.json()) as ErrorEnvelope;
  } catch {
    envelope = undefined;
  }

  const code =
    typeof envelope?.error?.code === "string"
      ? envelope.error.code
      : `HTTP_${response.status}`;
  const message =
    typeof envelope?.error?.message === "string"
      ? envelope.error.message
      : (STATUS_MESSAGES[response.status] ?? response.statusText);

  return new ApiError(
    response.status,
    code,
    message,
    parseDetails(envelope?.error?.details),
  );
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal,
      headers: {
        Accept: "application/json",
        ...(init.body === undefined
          ? {}
          : { "Content-Type": "application/json" }),
        ...init.headers,
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new ApiError(
      0,
      "NETWORK_ERROR",
      "Cannot reach the task API. Start it with `npm run dev` and try again.",
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  if (!response.ok) {
    throw await parseError(response);
  }

  return (await response.json()) as T;
}

function listPath(params: ListTasksParams): string {
  const search = new URLSearchParams();

  if (params.q?.trim()) search.set("q", params.q.trim());
  if (params.status && params.status !== "all") {
    search.set("status", params.status);
  }
  if (params.page !== undefined) search.set("page", String(params.page));
  if (params.limit !== undefined) search.set("limit", String(params.limit));
  if (params.sort !== undefined) search.set("sort", params.sort);
  if (params.order !== undefined) search.set("order", params.order);

  const query = search.toString();
  return query ? `/tasks?${query}` : "/tasks";
}

export function listTasks(
  params: ListTasksParams = {},
  signal?: AbortSignal,
): Promise<TaskPage> {
  return request<TaskPage>(listPath(params), {}, signal);
}

export function getTask(id: string, signal?: AbortSignal): Promise<Task> {
  return request<Task>(`/tasks/${encodeURIComponent(id)}`, {}, signal);
}

export function createTask(
  input: CreateTaskInput,
  signal?: AbortSignal,
): Promise<Task> {
  return request<Task>(
    "/tasks",
    { method: "POST", body: JSON.stringify(input) },
    signal,
  );
}

export function updateTask(
  id: string,
  input: UpdateTaskInput,
  signal?: AbortSignal,
): Promise<Task> {
  return request<Task>(
    `/tasks/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(input) },
    signal,
  );
}

export function completeTask(id: string, signal?: AbortSignal): Promise<Task> {
  return request<Task>(
    `/tasks/${encodeURIComponent(id)}/complete`,
    { method: "POST" },
    signal,
  );
}

export function deleteTask(id: string, signal?: AbortSignal): Promise<void> {
  return request<void>(
    `/tasks/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    signal,
  );
}

/**
 * Counts come from three cheap `limit=1` list calls so the cards stay accurate
 * while the visible list is filtered or paginated.
 */
export async function getTaskCounts(signal?: AbortSignal): Promise<TaskCounts> {
  const [all, todo, completed] = await Promise.all([
    listTasks({ page: 1, limit: 1 }, signal),
    listTasks({ page: 1, limit: 1, status: "todo" }, signal),
    listTasks({ page: 1, limit: 1, status: "completed" }, signal),
  ]);

  return { total: all.total, todo: todo.total, completed: completed.total };
}

function healthUrl(): string {
  const explicit = import.meta.env.VITE_HEALTH_URL;
  if (explicit) return explicit;

  if (/^https?:\/\//.test(API_BASE)) {
    return new URL("/healthz", API_BASE).toString();
  }
  return "/healthz";
}

export async function checkHealth(signal?: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch(healthUrl(), {
      signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { status?: unknown };
    return body.status === "ok";
  } catch {
    return false;
  }
}
