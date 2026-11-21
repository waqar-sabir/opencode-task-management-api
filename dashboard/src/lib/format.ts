const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

/** Format an ISO timestamp in the viewer's locale and time zone. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return dateFormatter.format(date);
}

/** Compact relative time for list rows; falls back to a date after a week. */
export function formatRelative(iso: string, now: number = Date.now()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";

  const deltaSeconds = Math.round((date.getTime() - now) / 1000);
  const absolute = Math.abs(deltaSeconds);

  if (absolute < 45) return "just now";
  if (absolute < 3600) {
    const minutes = Math.round(deltaSeconds / 60);
    return `${Math.abs(minutes)}m ${minutes < 0 ? "ago" : "from now"}`;
  }
  if (absolute < 86_400) {
    const hours = Math.round(deltaSeconds / 3600);
    return `${Math.abs(hours)}h ${hours < 0 ? "ago" : "from now"}`;
  }
  if (absolute < 604_800) {
    const days = Math.round(deltaSeconds / 86_400);
    return `${Math.abs(days)}d ${days < 0 ? "ago" : "from now"}`;
  }
  return formatDateTime(iso);
}

export function completionRate(todo: number, completed: number): number {
  const total = todo + completed;
  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
}

export function pluralize(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
