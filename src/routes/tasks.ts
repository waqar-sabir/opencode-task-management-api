import { Router, type Request } from "express";

import { AppError } from "../errors.js";
import { listTasksQuerySchema } from "../schemas/list-tasks.js";
import {
  createTaskSchema,
  taskIdSchema,
  updateTaskSchema,
} from "../schemas/task.js";
import type { TaskService } from "../services/tasks.js";

/** Reject any body on endpoints that are defined as bodyless by the spec. */
function rejectRequestBody(request: Request): void {
  const contentLength = request.headers["content-length"];
  const hasDeclaredBody =
    (contentLength !== undefined && contentLength !== "0") ||
    request.headers["transfer-encoding"] !== undefined;

  if (hasDeclaredBody || request.body !== undefined) {
    throw AppError.validation("This endpoint does not accept a request body");
  }
}

export function createTaskRouter(service: TaskService): Router {
  const router = Router();

  router.post("/", async (request, response) => {
    const input = createTaskSchema.parse(request.body);
    const task = await service.createTask(input);

    response.status(201).location(`/api/v1/tasks/${task.id}`).json(task);
  });

  router.get("/", async (request, response) => {
    const query = listTasksQuerySchema.parse(request.query);
    const page = await service.listTasks(query);

    response.json({
      items: page.items,
      page: query.page,
      limit: query.limit,
      total: page.total,
    });
  });

  router.get("/:id", async (request, response) => {
    const id = taskIdSchema.parse(request.params.id);
    const task = await service.getTask(id);

    response.json(task);
  });

  router.patch("/:id", async (request, response) => {
    const id = taskIdSchema.parse(request.params.id);
    const patch = updateTaskSchema.parse(request.body);
    const task = await service.updateTask(id, patch);

    response.json(task);
  });

  router.delete("/:id", async (request, response) => {
    rejectRequestBody(request);
    const id = taskIdSchema.parse(request.params.id);
    await service.deleteTask(id);

    response.status(204).end();
  });

  router.post("/:id/complete", async (request, response) => {
    rejectRequestBody(request);
    const id = taskIdSchema.parse(request.params.id);
    const task = await service.completeTask(id);

    response.json(task);
  });

  return router;
}
