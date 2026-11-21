import type { HealthState } from "../hooks/useHealth";
import { Icon } from "./Icon";

export function Header({
  health,
  lastChecked,
  onRecheck,
  onNewTask,
  refreshing,
  onRefresh,
}: {
  health: HealthState;
  lastChecked: Date | null;
  onRecheck: () => void;
  onNewTask: () => void;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const healthLabel =
    health === "online"
      ? "API online"
      : health === "offline"
        ? "API offline"
        : "Checking API";

  const checkedLabel = lastChecked
    ? `Last checked at ${lastChecked.toLocaleTimeString()}`
    : "Not checked yet";

  return (
    <header className="app-header">
      <div className="brand">
        <span aria-hidden="true" className="brand-mark">
          <Icon name="check" size={22} />
        </span>
        <span>
          <span className="brand-name">Taskboard</span>
          <span className="brand-tagline">Local task dashboard</span>
        </span>
      </div>

      <div className="header-actions">
        <button
          className={`health-pill health-pill--${health}`}
          onClick={onRecheck}
          title={`${healthLabel}. ${checkedLabel}. Click to check again.`}
          type="button"
        >
          <Icon name={health === "offline" ? "wifi-off" : "wifi"} size={15} />
          <span>{healthLabel}</span>
        </button>

        <button
          aria-label="Refresh tasks"
          className="icon-button"
          disabled={refreshing}
          onClick={onRefresh}
          title="Refresh tasks"
          type="button"
        >
          <Icon
            className={refreshing ? "spin" : undefined}
            name="refresh"
            size={18}
          />
        </button>

        <button
          className="button button--primary"
          onClick={onNewTask}
          type="button"
        >
          <Icon name="plus" size={17} />
          <span>New task</span>
        </button>
      </div>
    </header>
  );
}
