import { randomUUID } from "node:crypto";

import { AppError } from "../errors.js";
import type {
  Task,
  TaskListQuery,
  TaskPage,
  TaskRepository,
} from "../repositories/task-repository.js";
import type { CreateTaskInput } from "../schemas/task.js";

export interface TaskService {
  createTask(input: CreateTaskInput): Promise<Task>;
  getTask(id: string): Promise<Task>;
  listTasks(query: TaskListQuery): Promise<TaskPage>;
}

/**
 * Framework-free task rules. Takes and returns plain objects only; the
 * repository is the sole dependency.
 */
export function createTaskService(repository: TaskRepository): TaskService {
  return {
    async createTask(input) {
      const now = new Date().toISOString();
      return repository.create({
        id: randomUUID(),
        title: input.title,
        description: input.description,
        createdAt: now,
        updatedAt: now,
      });
    },

    async getTask(id) {
      const task = await repository.findById(id);
      if (!task) {
        throw AppError.notFound();
      }
      return task;
    },

    async listTasks(query) {
      return repository.list(query);
    },
  };
}
