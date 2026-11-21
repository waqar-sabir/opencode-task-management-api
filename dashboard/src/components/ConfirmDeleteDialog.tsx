import { Modal } from "./Modal";

export function ConfirmDeleteDialog({
  taskTitle,
  busy,
  onCancel,
  onConfirm,
}: {
  taskTitle: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      onClose={busy ? () => undefined : onCancel}
      open
      title="Delete this task?"
      description="Deletion is permanent. The task disappears from lists, search, and filters."
      tone="danger"
    >
      <div className="confirm-body">
        <p className="confirm-task">{taskTitle}</p>
      </div>
      <div className="modal-actions">
        <button
          className="button button--quiet"
          data-autofocus
          disabled={busy}
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <button
          className="button button--danger"
          disabled={busy}
          onClick={onConfirm}
          type="button"
        >
          {busy ? "Deleting…" : "Delete task"}
        </button>
      </div>
    </Modal>
  );
}
