export type TaskStatus = "todo" | "completed";
export type StatusFilter = TaskStatus | "all";
export type SortField = "createdAt" | "updatedAt" | "title";
export type SortOrder = "asc" | "desc";

export interface Task {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly status: TaskStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
}

export interface TaskPage {
  readonly items: Task[];
  readonly page: number;
  readonly limit: number;
  readonly total: number;
}

export interface TaskCounts {
  readonly total: number;
  readonly todo: number;
  readonly completed: number;
}

export interface ValidationDetail {
  readonly path: string;
  readonly message: string;
}

export interface ListTasksParams {
  readonly q?: string;
  readonly status?: StatusFilter;
  readonly page?: number;
  readonly limit?: number;
  readonly sort?: SortField;
  readonly order?: SortOrder;
}

export interface CreateTaskInput {
  readonly title: string;
  readonly description: string;
}

export interface UpdateTaskInput {
  readonly title?: string;
  readonly description?: string;
}
