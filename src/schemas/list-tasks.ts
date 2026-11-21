import { z } from "zod";

import { codePointLength } from "./task.js";

const MAX_QUERY_CODE_POINTS = 200;

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function withDefault<T>(fallback: T) {
  return (value: unknown): unknown => (value === undefined ? fallback : value);
}

/** Accept only canonical positive integer strings, then enforce the range. */
function integerParameter(
  defaultValue: number,
  min: number,
  max = Number.MAX_SAFE_INTEGER,
) {
  return z.preprocess(
    withDefault(String(defaultValue)),
    z
      .string()
      .regex(/^[1-9]\d*$/, "Must be a positive integer")
      .transform(Number)
      .pipe(z.number().int().min(min).max(max)),
  );
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
  page: integerParameter(DEFAULT_PAGE, 1),
  limit: integerParameter(DEFAULT_LIMIT, 1, MAX_LIMIT),
  sort: z.preprocess(
    withDefault("createdAt"),
    z.enum(["createdAt", "updatedAt", "title"]),
  ),
  order: z.preprocess(withDefault("desc"), z.enum(["asc", "desc"])),
});

export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
