import { z } from "zod";

const MAX_TITLE_CODE_POINTS = 200;
const MAX_DESCRIPTION_CODE_POINTS = 2000;

/** Count Unicode code points, matching SQLite's `length()` semantics. */
export function codePointLength(value: string): number {
  return Array.from(value).length;
}

export const titleSchema = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => codePointLength(value) >= 1, {
    message: "Title must not be empty",
  })
  .refine((value) => codePointLength(value) <= MAX_TITLE_CODE_POINTS, {
    message: `Title must be at most ${MAX_TITLE_CODE_POINTS} characters`,
  });

export const descriptionSchema = z
  .string()
  .refine((value) => codePointLength(value) <= MAX_DESCRIPTION_CODE_POINTS, {
    message: `Description must be at most ${MAX_DESCRIPTION_CODE_POINTS} characters`,
  });

export const createTaskSchema = z.strictObject({
  title: titleSchema,
  description: descriptionSchema.default(""),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const taskIdSchema = z.uuid();

export const updateTaskSchema = z
  .strictObject({
    title: titleSchema.optional(),
    description: descriptionSchema.optional(),
  })
  .refine(
    (value) => value.title !== undefined || value.description !== undefined,
    { message: "At least one of title or description is required" },
  );

export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
