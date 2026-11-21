import { useId, useState } from "react";
import type { FormEvent } from "react";

import { createTask, updateTask } from "../api/client";
import { toApiError } from "../api/error";
import type { ApiError } from "../api/error";
import type { Task, UpdateTaskInput } from "../api/types";
import {
  DESCRIPTION_MAX,
  TITLE_MAX,
  codePointLength,
  hasErrors,
  validateTaskForm,
} from "../lib/validation";
import type { FieldErrors } from "../lib/validation";
import { ApiErrorNotice } from "./ApiErrorNotice";
import { Modal } from "./Modal";

export function TaskFormModal({
  mode,
  task,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  task?: Task;
  onClose: () => void;
  onSaved: (mode: "create" | "edit") => void;
}) {
  const titleFieldId = useId();
  const descriptionFieldId = useId();
  const titleErrorId = useId();
  const descriptionErrorId = useId();

  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);

  const titleLength = codePointLength(title);
  const descriptionLength = codePointLength(description);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors = validateTaskForm({ title, description });
    setErrors(nextErrors);
    if (hasErrors(nextErrors)) return;

    setSaving(true);
    setServerError(null);

    try {
      if (mode === "create" || !task) {
        await createTask({ title: title.trim(), description });
      } else {
        let patch: UpdateTaskInput = {};
        const trimmedTitle = title.trim();
        if (trimmedTitle !== task.title) {
          patch = { ...patch, title: trimmedTitle };
        }
        if (description !== task.description) {
          patch = { ...patch, description };
        }
        if (patch.title === undefined && patch.description === undefined) {
          onClose();
          return;
        }
        await updateTask(task.id, patch);
      }
      onSaved(mode);
    } catch (error) {
      const apiError = toApiError(error);
      const fieldErrors: FieldErrors = {};
      for (const detail of apiError.details) {
        if (
          (detail.path === "title" || detail.path === "description") &&
          fieldErrors[detail.path] === undefined
        ) {
          fieldErrors[detail.path] = detail.message;
        }
      }
      if (hasErrors(fieldErrors)) setErrors(fieldErrors);
      setServerError(apiError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      onClose={saving ? () => undefined : onClose}
      open
      title={mode === "create" ? "Create a task" : "Edit task"}
      description={
        mode === "create"
          ? "Only a title is required. You can add or change the description later."
          : "Changes refresh the task’s updated timestamp. Completion status is unchanged."
      }
    >
      <form className="task-form" noValidate onSubmit={handleSubmit}>
        <div className="field">
          <div className="field-heading">
            <label htmlFor={titleFieldId}>Title</label>
            <span
              className={`char-count${titleLength > TITLE_MAX ? " is-over" : ""}`}
            >
              {titleLength} / {TITLE_MAX}
            </span>
          </div>
          <input
            aria-describedby={errors.title ? titleErrorId : undefined}
            aria-invalid={Boolean(errors.title)}
            autoComplete="off"
            data-autofocus
            id={titleFieldId}
            onChange={(event) => {
              setTitle(event.target.value);
              setErrors((current) => ({ ...current, title: undefined }));
            }}
            placeholder="What needs to happen?"
            value={title}
          />
          {errors.title ? (
            <p className="field-error" id={titleErrorId}>
              {errors.title}
            </p>
          ) : null}
        </div>

        <div className="field">
          <div className="field-heading">
            <label htmlFor={descriptionFieldId}>
              Description <span className="field-optional">optional</span>
            </label>
            <span
              className={`char-count${descriptionLength > DESCRIPTION_MAX ? " is-over" : ""}`}
            >
              {descriptionLength} / {DESCRIPTION_MAX}
            </span>
          </div>
          <textarea
            aria-describedby={
              errors.description ? descriptionErrorId : undefined
            }
            aria-invalid={Boolean(errors.description)}
            id={descriptionFieldId}
            onChange={(event) => {
              setDescription(event.target.value);
              setErrors((current) => ({ ...current, description: undefined }));
            }}
            placeholder="Add context, links, or acceptance notes…"
            rows={5}
            value={description}
          />
          {errors.description ? (
            <p className="field-error" id={descriptionErrorId}>
              {errors.description}
            </p>
          ) : null}
        </div>

        {serverError ? <ApiErrorNotice compact error={serverError} /> : null}

        <div className="modal-actions">
          <button
            className="button button--quiet"
            disabled={saving}
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="button button--primary"
            disabled={saving}
            type="submit"
          >
            {saving
              ? "Saving…"
              : mode === "create"
                ? "Create task"
                : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
