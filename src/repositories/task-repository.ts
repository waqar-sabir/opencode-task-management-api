export type TaskStatus = "todo" | "completed";

export interface Task {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly status: TaskStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
}

export interface CreateTaskRecord {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TaskContentPatch {
  readonly title?: string;
  readonly description?: string;
}

export type TaskSortField = "createdAt" | "updatedAt" | "title";
export type SortOrder = "asc" | "desc";

export interface TaskListQuery {
  readonly q?: string;
  readonly status?: TaskStatus;
  readonly page: number;
  readonly limit: number;
  readonly sort: TaskSortField;
  readonly order: SortOrder;
}

export interface TaskPage {
  readonly items: readonly Task[];
  readonly total: number;
}

/**
 * Storage-agnostic repository contract. No SQL, driver, or HTTP types may
 * appear here; services depend only on this interface.
 */
export interface TaskRepository {
  create(input: CreateTaskRecord): Promise<Task>;
  findById(id: string): Promise<Task | null>;
  list(query: TaskListQuery): Promise<TaskPage>;
  updateContent(
    id: string,
    patch: TaskContentPatch,
    now: string,
  ): Promise<Task | null>;
  delete(id: string): Promise<boolean>;
  complete(id: string, completedAt: string): Promise<Task | null>;
}
