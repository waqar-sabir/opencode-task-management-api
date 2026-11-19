import { randomUUID } from "node:crypto";

import { AppError } from "../errors.js";
import type {
  Task,
  TaskListQuery,
  TaskPage,
  TaskRepository,
} from "../repositories/task-repository.js";
import type { CreateTaskInput, UpdateTaskInput } from "../schemas/task.js";

export interface TaskService {
  createTask(input: CreateTaskInput): Promise<Task>;
  getTask(id: string): Promise<Task>;
  listTasks(query: TaskListQuery): Promise<TaskPage>;
  updateTask(id: string, patch: UpdateTaskInput): Promise<Task>;
  deleteTask(id: string): Promise<void>;
  completeTask(id: string): Promise<Task>;
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

    async updateTask(id, patch) {
      const updated = await repository.updateContent(
        id,
        patch,
        new Date().toISOString(),
      );

      if (!updated) {
        throw AppError.notFound();
      }

      return updated;
    },

    async deleteTask(id) {
      const deleted = await repository.delete(id);
      if (!deleted) {
        throw AppError.notFound();
      }
    },

    async completeTask(id) {
      const completed = await repository.complete(id, new Date().toISOString());

      if (!completed) {
        throw AppError.notFound();
      }

      return completed;
    },
  };
}
