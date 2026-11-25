import { Router } from "express";

import { AppError } from "../errors.js";

/**
 * `GET /healthz` is unversioned and reports whether storage responds.
 * The check function is injected so the router never imports the database.
 */
export function createHealthRouter(
  check: () => void | Promise<void>,
): Router {
  const router = Router();

  router.get("/", async (_request, response) => {
    try {
      await check();
      response.json({ status: "ok" });
    } catch (error) {
      throw AppError.storageUnavailable("Storage is unavailable", error);
    }
  });

  return router;
}
