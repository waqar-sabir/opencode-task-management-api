import { useCallback, useEffect, useState } from "react";

import { getTaskCounts } from "../api/client";
import type { TaskCounts } from "../api/types";

interface CountsState {
  readonly counts: TaskCounts | null;
  readonly requestKey: string | null;
}

/**
 * Dashboard totals are independent of the visible filters. A failure keeps the
 * last known counts so a transient blip does not blank the summary cards.
 */
export function useTaskCounts() {
  const [state, setState] = useState<CountsState>({
    counts: null,
    requestKey: null,
  });
  const [version, setVersion] = useState(0);

  const requestKey = String(version);
  const loading = state.requestKey !== requestKey;

  useEffect(() => {
    const controller = new AbortController();

    getTaskCounts(controller.signal)
      .then((counts) => {
        setState({ counts, requestKey });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setState((previous) => ({ ...previous, requestKey }));
      });

    return () => controller.abort();
  }, [requestKey]);

  const refresh = useCallback(() => setVersion((value) => value + 1), []);

  return { counts: state.counts, loading, refresh };
}
