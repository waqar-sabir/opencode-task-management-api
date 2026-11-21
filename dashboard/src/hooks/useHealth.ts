import { useCallback, useEffect, useState } from "react";

import { checkHealth } from "../api/client";

export type HealthState = "checking" | "online" | "offline";

const POLL_INTERVAL_MS = 30_000;

/** Poll `/healthz` so the header can show whether the API is reachable. */
export function useHealth() {
  const [status, setStatus] = useState<HealthState>("checking");
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    const probe = async () => {
      const ok = await checkHealth(controller.signal);
      if (!active) return;
      setStatus(ok ? "online" : "offline");
      setLastChecked(new Date());
    };

    void probe();
    const timer = window.setInterval(() => void probe(), POLL_INTERVAL_MS);

    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [version]);

  const recheck = useCallback(() => {
    setStatus("checking");
    setVersion((value) => value + 1);
  }, []);

  return { status, lastChecked, recheck };
}
