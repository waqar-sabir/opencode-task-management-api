import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { pino } from "pino";

import { createApp } from "../src/app.js";
import { closeDatabase, openDatabase } from "../src/db/connection.js";
import { migrate } from "../src/db/migrations.js";
import {
  makeSearchText,
  SqliteTaskRepository,
} from "../src/db/sqlite-task-repository.js";

const TASK_COUNT = 10_000;
const SAMPLE_SIZE = 300;
const CRUD_BUDGET_MS = 100;
const LIST_BUDGET_MS = 200;

interface Sample {
  readonly label: string;
  readonly budgetMs: number;
  readonly durations: number[];
}

function percentile(sorted: number[], fraction: number): number {
  const index = Math.min(
    sorted.length - 1,
    Math.ceil(fraction * sorted.length) - 1,
  );
  return sorted[index] ?? 0;
}

async function measure(
  sample: Sample,
  action: () => Promise<void>,
): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await action();
  }

  for (let i = 0; i < SAMPLE_SIZE; i += 1) {
    const started = performance.now();
    await action();
    sample.durations.push(performance.now() - started);
  }
}

function report(samples: Sample[]): boolean {
  const header = [
    "Operation".padEnd(24),
    "n".padStart(5),
    "p50".padStart(9),
    "p95".padStart(9),
    "max".padStart(9),
    "budget".padStart(9),
    "result".padStart(8),
  ].join(" ");

  console.log(header);
  console.log("-".repeat(header.length));

  let passed = true;

  for (const sample of samples) {
    const sorted = [...sample.durations].sort((a, b) => a - b);
    const p50 = percentile(sorted, 0.5);
    const p95 = percentile(sorted, 0.95);
    const max = sorted[sorted.length - 1] ?? 0;
    const withinBudget = p95 <= sample.budgetMs;
    passed &&= withinBudget;

    console.log(
      [
        sample.label.padEnd(24),
        String(sorted.length).padStart(5),
        `${p50.toFixed(1)}ms`.padStart(9),
        `${p95.toFixed(1)}ms`.padStart(9),
        `${max.toFixed(1)}ms`.padStart(9),
        `${sample.budgetMs}ms`.padStart(9),
        (withinBudget ? "PASS" : "FAIL").padStart(8),
      ].join(" "),
    );
  }

  return passed;
}

async function main(): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "task-api-benchmark-"));
  const path = join(directory, "tasks.db");
  const database = openDatabase(path);
  migrate(database);

  const seededIds: string[] = [];
  const seededTodoIds: string[] = [];
  const base = Date.parse("2026-01-01T00:00:00.000Z");

  const insert = database.prepare(`
    INSERT INTO tasks
      (id, title, description, search_text, status, created_at, updated_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const seedStarted = performance.now();
  database.exec("BEGIN");
  for (let i = 0; i < TASK_COUNT; i += 1) {
    const id = randomUUID();
    const title = `Benchmark task ${String(i).padStart(5, "0")}`;
    const description = `Synthetic description for benchmark item ${i}`;
    const createdAt = new Date(base + i * 1000).toISOString();
    const completed = i % 10 === 0;
    const completedAt = completed ? createdAt : null;

    insert.run(
      id,
      title,
      description,
      makeSearchText(title, description),
      completed ? "completed" : "todo",
      createdAt,
      createdAt,
      completedAt,
    );

    seededIds.push(id);
    if (!completed) {
      seededTodoIds.push(id);
    }
  }
  database.exec("COMMIT");
  const seedMs = performance.now() - seedStarted;

  console.log(
    `Seeded ${TASK_COUNT.toLocaleString()} tasks in ${seedMs.toFixed(0)} ms (${path})`,
  );
  console.log();

  const logger = pino({ level: "silent" });
  const repository = new SqliteTaskRepository(database);
  const app = createApp({
    repository,
    logger,
    healthCheck: () => {
      database.prepare("SELECT 1").get();
    },
  });

  const server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => {
      resolve(listening);
    });
  });

  const address = server.address();
  if (typeof address !== "object" || address === null) {
    throw new Error("Benchmark server did not expose a port");
  }
  const origin = `http://127.0.0.1:${address.port}`;

  const expectOk = async (response: Response, expected: number[]) => {
    if (!expected.includes(response.status)) {
      throw new Error(
        `Unexpected ${response.status} from ${response.url}: ${await response.text()}`,
      );
    }
    await response.arrayBuffer();
  };

  const detailSample: Sample = {
    label: "GET /tasks/:id",
    budgetMs: CRUD_BUDGET_MS,
    durations: [],
  };
  const listSample: Sample = {
    label: "GET /tasks",
    budgetMs: LIST_BUDGET_MS,
    durations: [],
  };
  const deepListSample: Sample = {
    label: "GET /tasks?page=400",
    budgetMs: LIST_BUDGET_MS,
    durations: [],
  };
  const searchSample: Sample = {
    label: "GET /tasks?q=09999",
    budgetMs: LIST_BUDGET_MS,
    durations: [],
  };
  const filterSample: Sample = {
    label: "GET /tasks?status=todo",
    budgetMs: LIST_BUDGET_MS,
    durations: [],
  };
  const createSample: Sample = {
    label: "POST /tasks",
    budgetMs: CRUD_BUDGET_MS,
    durations: [],
  };
  const updateSample: Sample = {
    label: "PATCH /tasks/:id",
    budgetMs: CRUD_BUDGET_MS,
    durations: [],
  };
  const completeSample: Sample = {
    label: "POST /tasks/:id/complete",
    budgetMs: CRUD_BUDGET_MS,
    durations: [],
  };
  const deleteSample: Sample = {
    label: "DELETE /tasks/:id",
    budgetMs: CRUD_BUDGET_MS,
    durations: [],
  };

  let detailCursor = 0;
  let updateCursor = 0;
  let completeCursor = 0;
  const createdIds: string[] = [];

  try {
    await measure(detailSample, async () => {
      const id = seededIds[detailCursor % seededIds.length] as string;
      detailCursor += 1;
      await expectOk(await fetch(`${origin}/api/v1/tasks/${id}`), [200]);
    });

    await measure(listSample, async () => {
      await expectOk(await fetch(`${origin}/api/v1/tasks`), [200]);
    });

    await measure(deepListSample, async () => {
      await expectOk(await fetch(`${origin}/api/v1/tasks?page=400`), [200]);
    });

    await measure(searchSample, async () => {
      await expectOk(await fetch(`${origin}/api/v1/tasks?q=09999`), [200]);
    });

    await measure(filterSample, async () => {
      await expectOk(await fetch(`${origin}/api/v1/tasks?status=todo`), [200]);
    });

    await measure(createSample, async () => {
      const response = await fetch(`${origin}/api/v1/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: `Benchmark create ${randomUUID()}` }),
      });
      if (response.status !== 201) {
        throw new Error(
          `Unexpected ${response.status} from create: ${await response.text()}`,
        );
      }
      const body = (await response.json()) as { id: string };
      createdIds.push(body.id);
    });

    await measure(updateSample, async () => {
      const id = seededIds[updateCursor % seededIds.length] as string;
      updateCursor += 1;
      const response = await fetch(`${origin}/api/v1/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: `Updated ${randomUUID()}` }),
      });
      await expectOk(response, [200]);
    });

    await measure(completeSample, async () => {
      const id = seededTodoIds[completeCursor % seededTodoIds.length] as string;
      completeCursor += 1;
      const response = await fetch(`${origin}/api/v1/tasks/${id}/complete`, {
        method: "POST",
      });
      await expectOk(response, [200]);
    });

    await measure(deleteSample, async () => {
      const id = createdIds.pop() as string;
      const response = await fetch(`${origin}/api/v1/tasks/${id}`, {
        method: "DELETE",
      });
      await expectOk(response, [204]);
    });
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
    closeDatabase(database);
    rmSync(directory, { recursive: true, force: true });
  }

  const passed = report([
    detailSample,
    listSample,
    deepListSample,
    searchSample,
    filterSample,
    createSample,
    updateSample,
    completeSample,
    deleteSample,
  ]);

  console.log();
  console.log(
    passed
      ? "All operations are within the SPEC.md performance budgets."
      : "One or more operations exceeded the SPEC.md performance budgets.",
  );
  process.exitCode = passed ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
