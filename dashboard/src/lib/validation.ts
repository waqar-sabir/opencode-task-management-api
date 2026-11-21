export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 2000;

export type TaskField = "title" | "description";
export type FieldErrors = Partial<Record<TaskField, string>>;

/** Count Unicode code points, matching the API's title and description limits. */
export function codePointLength(value: string): number {
  return Array.from(value).length;
}

export function validateTaskForm(input: {
  title: string;
  description: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  const title = input.title.trim();

  if (title.length === 0) {
    errors.title = "Title is required.";
  } else if (codePointLength(title) > TITLE_MAX) {
    errors.title = `Keep the title to ${TITLE_MAX} characters or fewer.`;
  }

  if (codePointLength(input.description) > DESCRIPTION_MAX) {
    errors.description = `Keep the description to ${DESCRIPTION_MAX} characters or fewer.`;
  }

  return errors;
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}
