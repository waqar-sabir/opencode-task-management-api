import { useCallback, useEffect, useRef, useState } from "react";

export type ToastTone = "success" | "error";

export interface Toast {
  readonly id: string;
  readonly tone: ToastTone;
  readonly message: string;
}

const TOAST_LIFETIME_MS = 4500;

function nextId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Small transient notification queue with automatic dismissal. */
export function useToasts() {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  const timers = useRef(new Map<string, number>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string) => {
      const id = nextId();
      setToasts((current) => [...current, { id, tone, message }]);
      const timer = window.setTimeout(() => dismiss(id), TOAST_LIFETIME_MS);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) window.clearTimeout(timer);
      pending.clear();
    };
  }, []);

  return { toasts, push, dismiss };
}
