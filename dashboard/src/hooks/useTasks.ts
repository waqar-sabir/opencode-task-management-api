import { useCallback, useEffect, useMemo, useState } from "react";

import { listTasks } from "../api/client";
import { toApiError } from "../api/error";
import type { ApiError } from "../api/error";
import type { ListTasksParams, TaskPage } from "../api/types";

interface TasksState {
  readonly data: TaskPage | null;
  readonly error: ApiError | null;
  /** Identifies the query/refresh combination the current state belongs to. */
  readonly requestKey: string | null;
}

/** Load one page of tasks and refetch when the query or refresh key changes. */
export function useTasks(query: ListTasksParams) {
  const [state, setState] = useState<TasksState>({
    data: null,
    error: null,
    requestKey: null,
  });
  const [version, setVersion] = useState(0);

  const requestKey = useMemo(
    () => JSON.stringify({ query, version }),
    [query, version],
  );
  const loading = state.requestKey !== requestKey;

  useEffect(() => {
    const controller = new AbortController();

    listTasks(query, controller.signal)
      .then((data) => {
        setState({ data, error: null, requestKey });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState((previous) => ({
          data: previous.data,
          error: toApiError(error),
          requestKey,
        }));
      });

    return () => controller.abort();
  }, [query, requestKey]);

  const refresh = useCallback(() => setVersion((value) => value + 1), []);

  return { data: state.data, loading, error: state.error, refresh };
}
