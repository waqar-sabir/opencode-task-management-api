import { z } from "zod";

import { codePointLength } from "./task.js";

const MAX_QUERY_CODE_POINTS = 200;

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function withDefault<T>(fallback: T) {
  return (value: unknown): unknown => (value === undefined ? fallback : value);
}

export const listTasksQuerySchema = z.strictObject({
  q: z
    .string()
    .transform((value) => value.trim())
    .refine((value) => codePointLength(value) <= MAX_QUERY_CODE_POINTS, {
      message: `q must be at most ${MAX_QUERY_CODE_POINTS} characters`,
    })
    .optional(),
  status: z.enum(["todo", "completed"]).optional(),
  page: z.preprocess(withDefault(DEFAULT_PAGE), z.coerce.number().int().min(1)),
  limit: z.preprocess(
    withDefault(DEFAULT_LIMIT),
    z.coerce.number().int().min(1).max(MAX_LIMIT),
  ),
  sort: z.preprocess(
    withDefault("createdAt"),
    z.enum(["createdAt", "updatedAt", "title"]),
  ),
  order: z.preprocess(withDefault("desc"), z.enum(["asc", "desc"])),
});

export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
