import { Router } from "express";

import { listTasksQuerySchema } from "../schemas/list-tasks.js";
import { createTaskSchema, taskIdSchema } from "../schemas/task.js";
import type { TaskService } from "../services/tasks.js";

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

  return router;
}
