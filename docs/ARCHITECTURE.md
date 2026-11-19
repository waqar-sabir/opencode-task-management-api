# Task Management API — Architecture

**Status:** Approved v1.0 — implementation not started
**Date:** 2026-11-18
**Scope:** Single-user local HTTP API
**Related documents:** [`SPEC.md`](./SPEC.md), [`PLAN.md`](./PLAN.md)

---

## 1. Context and constraints

The system is a local, single-process HTTP API backed by one SQLite file. It has no
authentication, no external services, and no multi-instance coordination. The
architecture is optimized for correctness, explainability, and low operational overhead,
not for horizontal scale.

Hard constraints from the approved specification:

- Node.js 24 LTS.
- TypeScript with strict settings.
- SQLite persistence; no database server.
- One task list per instance; no owner or tenant column.
- Statuses are only `todo` and `completed`; completion is terminal.
- No ORM, no CORS, no rate limiting, and no background workers.
- Default network bind is `127.0.0.1`.

---

## 2. Architecture overview

```text
HTTP client (curl, script, future UI)
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ Express app (src/app.ts)                                    │
│                                                             │
│  request logger / request ID                                │
│        │                                                    │
│        ▼                                                    │
│  routes (HTTP only)                                         │
│        │                                                    │
│        ▼                                                    │
│  Zod schemas (body, params, query)                          │
│        │                                                    │
│        ▼                                                    │
│  services (task rules)                                      │
│        │                                                    │
│        ▼                                                    │
│  TaskRepository interface                                   │
│        │                                                    │
│        ▼                                                    │
│  SqliteTaskRepository (SQL, transactions, row mapping)      │
│        │                                                    │
│        ▼                                                    │
│  node:sqlite  ──►  ./data/tasks.db (+ -wal, -shm)           │
│                                                             │
│  error middleware (single response envelope)                │
└─────────────────────────────────────────────────────────────┘

src/server.ts
  config → open DB → run migrations → create repository
  → build app → listen → graceful shutdown
```

Key structural decisions:

- **App/server split.** `app.ts` builds an Express app from injected dependencies and
  never binds a port. `server.ts` owns process concerns. Tests import `app.ts` only.
- **Dependency injection.** The app receives a `TaskRepository` and a health-check
  function. No module-level database singleton exists, so tests can create isolated
  in-memory databases.
- **Layer boundaries.** Routes know HTTP; services know task rules; the repository knows
  SQL. No Express types cross into services or the repository.
- **One error path.** A single error middleware converts validation, domain, HTTP parser,
  and SQLite failures into the response envelope.

---

## 3. Technology stack

| Concern | Choice | Rationale |
| --- | --- | --- |
| Runtime | Node.js 24 LTS | LTS support window; built-in SQLite; modern ESM support |
| Language | TypeScript, ESM | Static contracts and safer refactors |
| HTTP framework | Express 5 | Familiar, small, promise-aware error propagation |
| Validation | Zod | Runtime validation plus inferred TypeScript types |
| Logging | pino + pino-http | Structured JSON, low overhead |
| Database | `node:sqlite` (`DatabaseSync`) | Built-in, synchronous, no native add-on |
| Tests | Vitest + Supertest | Fast unit/integration tests without network ports |
| Dev runner | tsx | Direct TypeScript execution with watch mode |
| Build | tsc | Plain JavaScript output in `dist/` |
| Lint/format | ESLint + Prettier | Consistent style and static checks |
| Package manager | npm | Committed `package-lock.json` |

### 3.1 Why `node:sqlite`

- No native compilation, prebuilt binary, or install-time toolchain.
- Synchronous API is a good fit for a single-process local service and simplifies
  repository tests.
- Supports `RETURNING`, `CHECK`, WAL, and `PRAGMA user_version`, which the design uses.
- Verified during design on Node 24.17.0 with bundled SQLite 3.53.0.

Trade-off: `node:sqlite` is newer than mature third-party drivers. The runtime major is
pinned via `.nvmrc` and `engines`, and the repository has direct tests. If the built-in
API becomes unsuitable, `better-sqlite3` is the fallback behind the same interface.

### 3.2 Why no ORM

The schema is one table with a handful of queries. Explicit SQL keeps the idempotent
completion update, wildcard escaping, and count/page behavior visible. An ORM would add
code generation and hidden query behavior without removing meaningful complexity.

### 3.3 Why Express 5

Express 5 propagates rejected promises from async handlers to error middleware, so the
API can use async route handlers without a wrapper. The framework surface is small and
well understood. No CORS, static files, sessions, or view engine is configured.

---

## 4. Component responsibilities

| Component | Responsibility | Must not |
| --- | --- | --- |
| `src/config.ts` | Read and validate environment once; export typed config | Read `process.env` elsewhere |
| `src/app.ts` | Build Express app, attach middleware/routes, inject dependencies | Open a port or a database |
| `src/server.ts` | Load config, open DB, migrate, create repo, listen, shut down | Contain business rules |
| `src/routes/tasks.ts` | Parse HTTP input, call services, set status codes/headers | Contain SQL or business rules |
| `src/routes/health.ts` | Expose `/healthz` using injected health check | Import the database directly |
| `src/schemas/task.ts` | Create/update body schemas, UUID schema, code-point rules | Touch storage |
| `src/schemas/list-tasks.ts` | Query-string schema with defaults and strict keys | Read raw `req.query` elsewhere |
| `src/services/tasks.ts` | Create IDs/timestamps, call repository, translate absence to not-found | Use Express or SQL |
| `src/repositories/task-repository.ts` | Storage-agnostic interface used by services | Leak SQL types |
| `src/db/connection.ts` | Open SQLite, set pragmas, ensure directory/permissions | Implement task queries |
| `src/db/migrations.ts` | Forward-only schema migrations via `user_version` | Depend on HTTP |
| `src/db/sqlite-task-repository.ts` | SQL, transactions, search, pagination, idempotent completion | Return HTTP errors |
| `src/db/row-mapper.ts` | Map snake_case rows to domain `Task` objects | Expose storage fields |
| `src/middleware/request-logger.ts` | Assign/propagate request ID, emit request logs | Log body, title, description, or `q` |
| `src/middleware/error-handler.ts` | Convert errors to the standard envelope and status | Leak stack traces or SQL |
| `src/errors.ts` | `AppError` and stable error codes | Contain transport-specific data |

---

## 5. Project structure

```text
task-management-api/
├── AGENTS.md
├── README.md
├── package.json
├── package-lock.json
├── tsconfig.json
├── tsconfig.build.json
├── eslint.config.js
├── .prettierrc
├── .nvmrc
├── .gitignore
├── .env.example
├── docs/
│   ├── SPEC.md
│   ├── ARCHITECTURE.md
│   └── PLAN.md
├── src/
│   ├── app.ts
│   ├── server.ts
│   ├── config.ts
│   ├── errors.ts
│   ├── db/
│   │   ├── connection.ts
│   │   ├── migrations.ts
│   │   ├── row-mapper.ts
│   │   └── sqlite-task-repository.ts
│   ├── routes/
│   │   ├── tasks.ts
│   │   └── health.ts
│   ├── schemas/
│   │   ├── task.ts
│   │   └── list-tasks.ts
│   ├── services/
│   │   └── tasks.ts
│   ├── repositories/
│   │   └── task-repository.ts
│   └── middleware/
│       ├── error-handler.ts
│       └── request-logger.ts
├── tests/
│   ├── unit/
│   │   ├── services/
│   │   └── db/
│   └── integration/
│       ├── tasks.test.ts
│       └── persistence.test.ts
├── data/                  # runtime only; gitignored
└── dist/                  # build output; gitignored
```

Conventions:

- ESM with `"type": "module"`.
- `module` and `moduleResolution` set to `NodeNext`; relative imports use `.js` suffixes.
- `strict` and `noUncheckedIndexedAccess` enabled.
- `tsconfig.build.json` excludes tests and emits to `dist/`.
- No application logic in `index.ts`-style entrypoints; `server.ts` is the process entry.

---

## 6. Request lifecycle

1. **Request ID.** Read `X-Request-Id` if present; otherwise generate a UUID. Echo it in
   the response header and attach it to the request-scoped logger.
2. **Body parsing.** `express.json({ limit: "100kb", strict: true })`.
3. **Content-type check.** `POST` and `PATCH` require `application/json`; otherwise
   `415 UNSUPPORTED_MEDIA_TYPE`.
4. **Route matching.** Unknown paths reach the 404 handler and return `NOT_FOUND`.
5. **Validation.** Zod parses params, body, and query with strict object schemas.
6. **Service call.** The service generates IDs/timestamps, invokes the repository, and
   maps missing rows to `NotFound`.
7. **Response.** Success bodies are plain JSON; create sets `Location`; delete returns
   `204`.
8. **Error handling.** Any thrown error reaches the single error middleware, which maps
   it to the envelope and logs server-side detail.

Express 5 forwards rejected promises from async handlers automatically.

---

## 7. Data storage design

### 7.1 Schema

Version 1 migration:

```sql
CREATE TABLE tasks (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL
               CHECK (length(trim(title)) > 0 AND length(title) <= 200),
  description  TEXT NOT NULL DEFAULT ''
               CHECK (length(description) <= 2000),
  search_text  TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'todo'
               CHECK (status IN ('todo', 'completed')),
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  completed_at TEXT,
  CHECK ((status = 'completed') = (completed_at IS NOT NULL))
);

CREATE INDEX idx_tasks_created_at
  ON tasks (created_at DESC, id DESC);

CREATE INDEX idx_tasks_status_created_at
  ON tasks (status, created_at DESC, id DESC);
```

Column notes:

- `id`: UUID v4 string from `crypto.randomUUID()`.
- `title`: trimmed by the service; SQLite `length()` counts Unicode characters, matching
  the code-point rule. The `trim()` check is defense in depth; the service trims all
  whitespace.
- `description`: stored as supplied; omitted becomes `""`.
- `search_text`: derived, normalized, never exposed. See §7.6.
- `status`: constrained to two values.
- `created_at` / `updated_at`: ISO 8601 UTC strings with milliseconds.
- `completed_at`: `NULL` for `todo`; non-null for `completed`, enforced by a `CHECK`.

### 7.2 Indexes

- `(created_at DESC, id DESC)` supports the default unfiltered list and its tie-break.
- `(status, created_at DESC, id DESC)` supports filtered lists.
- Sorting by `updated_at` or `title` performs a scan and sort. At the 10,000-task target
  this is acceptable; adding more indexes would slow writes for little benefit.
- No index accelerates leading-wildcard search. A full scan over 10,000 short rows is
  cheap; FTS5 is deferred.

### 7.3 Connection and pragmas

```ts
const db = new DatabaseSync(resolvedPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = FULL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
`);
```

- **WAL** allows readers during writes and creates `-wal` / `-shm` side files.
- **`synchronous=FULL`** honors the durability requirement: a successful commit is
  durable before the response. The cost is one fsync per write, acceptable at 10 rps.
- **`busy_timeout`** waits up to five seconds for a lock before returning an error.
- **`foreign_keys`** is enabled for future schema growth; v1 has no foreign keys.
- One `DatabaseSync` instance exists per process. It is opened in `server.ts`, passed to
  the repository, and closed during shutdown.
- The parent directory is created recursively with mode `0700`; the database file is
  changed to `0600` on POSIX. This matters because there is no authentication.
- `:memory:` skips filesystem setup and is used by tests.

### 7.4 Migrations

- Schema version is stored in `PRAGMA user_version`.
- Migrations are an ordered array of `{ version, sql }`, applied forward only.
- Each migration runs inside `BEGIN IMMEDIATE`; the version update is committed in the
  same transaction. A failure rolls back.
- Startup fails with a clear message if the database version is newer than the code’s
  latest migration.
- No down migrations in v1.
- Migration 1 creates the table and both indexes.
- Tests run the same migration path against `:memory:`; persistence tests also exercise
  a temporary file database.

### 7.5 Repository contract

```ts
export type TaskStatus = "todo" | "completed";

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface CreateTaskRecord {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskContentPatch {
  title?: string;
  description?: string;
}

export interface TaskListQuery {
  q?: string;
  status?: TaskStatus;
  page: number;
  limit: number;
  sort: "createdAt" | "updatedAt" | "title";
  order: "asc" | "desc";
}

export interface TaskRepository {
  create(input: CreateTaskRecord): Promise<Task>;
  findById(id: string): Promise<Task | null>;
  list(query: TaskListQuery): Promise<{ items: Task[]; total: number }>;
  updateContent(
    id: string,
    patch: TaskContentPatch,
    now: string,
  ): Promise<Task | null>;
  delete(id: string): Promise<boolean>;
  complete(id: string, completedAt: string): Promise<Task | null>;
}
```

The interface is async even though SQLite calls are synchronous. This keeps services and
tests independent of the driver and leaves room for an asynchronous adapter later.

### 7.6 Search text and normalization

SQLite’s `LIKE` and `COLLATE NOCASE` fold ASCII only. To make case-insensitive matching
work for non-ASCII case pairs, the repository stores a derived `search_text` column:

```ts
const normalizeForSearch = (value: string) =>
  value.normalize("NFC").toLowerCase();

const makeSearchText = (title: string, description: string) =>
  normalizeForSearch(`${title}\n${description}`);

const escapeLike = (value: string) =>
  value.replace(/[\\%_]/g, (character) => `\\${character}`);

const pattern = `%${escapeLike(normalizeForSearch(q))}%`;
```

- `search_text` is recomputed on create and whenever title or description changes.
- It is never returned by the API.
- `%`, `_`, and `\` in user input are escaped and matched literally.
- `q` is trimmed by the service; empty values skip the search clause.
- Matching is case-insensitive but not accent-insensitive. `cafe` does not match `café`.
- Because both sides are normalized in JavaScript, `CAFÉ` matches `café` even though
  SQLite itself only folds ASCII.

### 7.7 Query patterns

**Create**

```sql
INSERT INTO tasks
  (id, title, description, search_text, status, created_at, updated_at, completed_at)
VALUES (?, ?, ?, ?, 'todo', ?, ?, NULL)
RETURNING *;
```

**Find**

```sql
SELECT * FROM tasks WHERE id = ?;
```

**List**

Dynamic, parameterized `WHERE`; allowlisted sort column; `LIMIT/OFFSET`:

```ts
const where: string[] = [];
const params: unknown[] = [];

if (status) {
  where.push("status = ?");
  params.push(status);
}
if (q) {
  where.push("search_text LIKE ? ESCAPE '\\'");
  params.push(pattern);
}

const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
const total = db
  .prepare(`SELECT COUNT(*) AS total FROM tasks ${whereSql}`)
  .get(...params) as { total: number };

const rows = db
  .prepare(`
    SELECT * FROM tasks
    ${whereSql}
    ORDER BY ${sortColumn} ${direction}, id ${direction}
    LIMIT ? OFFSET ?
  `)
  .all(...params, limit, (page - 1) * limit);
```

- `sortColumn` comes from a fixed map:
  `createdAt → created_at`, `updatedAt → updated_at`,
  `title → title COLLATE NOCASE`.
- `direction` is only `ASC` or `DESC`.
- `id` is the tie-breaker in the same direction as the requested order.
- `total` uses the same filters as the page query.

**Update**

Read, merge, and write inside `BEGIN IMMEDIATE`:

1. Select the current row.
2. Apply only supplied `title` / `description`.
3. Recompute `search_text`.
4. `UPDATE tasks SET title=?, description=?, search_text=?, updated_at=? WHERE id=? RETURNING *`.
5. Commit; return the mapped task or `null`.

The transaction prevents a concurrent writer from changing the row between read and
write. Within the single-process target, it also documents intent.

**Delete**

```sql
DELETE FROM tasks WHERE id = ?;
```

`changes === 1` means a row was deleted; otherwise the service returns not found.

**Complete**

One atomic, idempotent statement:

```sql
UPDATE tasks
SET status = 'completed',
    completed_at = COALESCE(completed_at, ?),
    updated_at = CASE WHEN status = 'todo' THEN ? ELSE updated_at END
WHERE id = ?
RETURNING *;
```

- SQLite evaluates `SET` expressions against the old row.
- The first call sets `completed_at` and `updated_at`.
- Repeat calls preserve both values, so the operation is idempotent.
- No read-modify-write sequence is needed, so the operation is atomic.

### 7.8 Transactions and concurrency

- One writer process; WAL permits readers during writes.
- `updateContent` uses `BEGIN IMMEDIATE` for its read-modify-write.
- `create`, `delete`, and `complete` are single statements.
- Concurrent edits are last-write-wins. There is no version column or ETag in v1.
- `SQLITE_BUSY` / `SQLITE_LOCKED` after the busy timeout maps to `503`.
- All other SQLite errors are logged internally and returned as `500`.

### 7.9 Row mapping

- Rows use snake_case; the API uses camelCase.
- `row-mapper.ts` converts fields explicitly:
  `created_at → createdAt`, `updated_at → updatedAt`, `completed_at → completedAt`.
- `status` is validated as `todo` or `completed` before being cast.
- `search_text` is dropped during mapping.
- Timestamps remain strings; no `Date` objects cross the repository boundary.

### 7.10 Error mapping

| Source | Mapping |
| --- | --- |
| Zod validation | `400 VALIDATION_ERROR` with `details` |
| Malformed JSON body | `400 VALIDATION_ERROR` |
| Body over 100 KB | `413 PAYLOAD_TOO_LARGE` |
| Missing/wrong content type on write | `415 UNSUPPORTED_MEDIA_TYPE` |
| Unknown route | `404 NOT_FOUND` |
| Missing task | `404 NOT_FOUND` |
| SQLite busy/locked | `503 STORAGE_UNAVAILABLE` |
| Any other error | `500 INTERNAL_ERROR` |

The error middleware is the only place that writes error responses. It logs the full
server-side error with the request ID, then emits the sanitized envelope.

### 7.11 Lifecycle and permissions

Startup sequence in `server.ts`:

1. Load and validate configuration.
2. Open the SQLite database (create parent directory if needed).
3. Apply pragmas and migrations.
4. Build the repository and app.
5. Listen on `HOST:PORT`.
6. Register `SIGINT` and `SIGTERM` handlers.

Shutdown sequence:

1. Stop accepting new connections (`server.close`).
2. Wait briefly for in-flight requests, then force-close if necessary.
3. Close the SQLite connection.
4. Exit with a non-zero code only on failure.

On POSIX, the data directory is `0700` and the database file is `0600`. This reduces
exposure because the file itself is the security boundary.

---

## 8. API layer design

### 8.1 Validation

- Every body, param, and query object is parsed by a strict Zod schema.
- Unknown keys are rejected, not stripped.
- UUID params are validated before the service is called.
- Length limits are enforced with a helper based on `Array.from(value).length`, matching
  SQLite’s character count.
- `title` is trimmed before validation; `description` is stored as supplied.
- `PATCH` requires at least one of `title` or `description`.
- Query parsing applies defaults before the service call:
  `page=1`, `limit=20`, `sort=createdAt`, `order=desc`.
- Repeated `status` parameters arrive as arrays and fail the string schema, producing
  `400`.

### 8.2 Services

`tasks.ts` contains small, framework-free functions:

- `createTask(input)`: generate UUID and timestamps; call repository.
- `getTask(id)`: call repository; throw `NotFound` when absent.
- `listTasks(query)`: call repository; return the page.
- `updateTask(id, patch)`: call repository; throw `NotFound` when absent.
- `deleteTask(id)`: call repository; throw `NotFound` when false.
- `completeTask(id)`: call repository; throw `NotFound` when absent.

Services do not know about Express, status codes, or SQL. They throw `AppError` values
with stable codes; middleware maps those to HTTP.

### 8.3 Routes

- `POST /tasks` → `201`, `Location`, task body.
- `GET /tasks` → `200`, page envelope.
- `GET /tasks/:id` → `200`, task body.
- `PATCH /tasks/:id` → `200`, task body.
- `DELETE /tasks/:id` → `204`, no body.
- `POST /tasks/:id/complete` → `200`, task body.
- `GET /healthz` → `200` or `503`.

Routes parse input, call one service function, and send the result. No branching on
business rules.

### 8.4 HTTP details

- `express.json({ limit: "100kb", strict: true })` rejects oversized or non-object JSON.
- A content-type guard runs before body validation for `POST`/`PATCH`.
- `X-Request-Id` is echoed or generated.
- Responses use `application/json; charset=utf-8`.
- `204` responses have no body.
- No CORS headers, cookies, sessions, or auth middleware.
- Unknown methods on known paths fall through to the 404 handler; `405` is not used.

---

## 9. Configuration

`src/config.ts` is the only module that reads `process.env`. It validates with Zod and
exports a frozen typed object.

| Variable | Default | Rules |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development`, `test`, or `production` |
| `PORT` | `3000` | Integer 1–65535 |
| `HOST` | `127.0.0.1` | Non-empty string |
| `DATABASE_PATH` | `./data/tasks.db` | File path or `:memory:` |
| `LOG_LEVEL` | `info` | pino level |

Behavior:

- Invalid values fail startup with a clear message.
- Any non-loopback `HOST` logs a prominent warning that the API has no authentication.
- `DATABASE_PATH=:memory:` is intended for tests; production use loses data on exit.
- No secrets are required, so `.env` is optional.
- `.env.example` documents the variables but is not required to run.
- Relative database paths resolve from the process working directory.

---

## 10. Observability

- pino emits one-line JSON logs.
- Every request has a request ID from `X-Request-Id` or a generated UUID.
- Request log fields: `requestId`, `method`, `path`, `status`, `durationMs`.
- The query string is not logged because it may contain user-entered search text.
- Titles, descriptions, and task bodies are never logged.
- Error logs include the request ID, error code, and stack; the response does not.
- Startup logs include version, host, port, and database path (not secrets).
- Shutdown logs record signal and close status.
- `/healthz` performs `SELECT 1`; failure returns `503` and logs the request ID.

---

## 11. Security

### 11.1 Threat model

The intended deployment is a trusted local machine. The API has no authentication, so
anyone who can reach the port can read and mutate all tasks. The design reduces exposure
but does not make public deployment safe.

Controls:

- Bind `127.0.0.1` by default; warn on any non-loopback host.
- Create the data directory as `0700` and the database file as `0600` on POSIX.
- Cap request bodies at 100 KB and `q` at 200 code points.
- Use parameterized SQL for all values.
- Allowlist sort columns and directions; never interpolate user input into SQL structure.
- Reject unknown fields and query parameters.
- Do not log task content or search terms.
- Return generic `500` responses; log details server-side.
- Do not enable CORS or serve HTML.
- Do not commit `.env`, database files, or WAL side files.

If the API must be exposed beyond localhost, add at minimum authentication, TLS
termination, rate limiting, and request-size limits at a reverse proxy. Those are not v1
features.

### 11.2 SQL injection

All values are bound parameters. The only dynamically built SQL fragments are:

- `WHERE` clause selection from fixed strings;
- `ORDER BY` column and direction from fixed allowlists.

No user-provided identifier reaches SQL text.

### 11.3 Data privacy

Task content stays in the local SQLite file. Logs intentionally exclude it. The database
file is readable by the OS user running the process; file permissions are the boundary.

---

## 12. Performance and scale

Target: 10,000 tasks, 10 requests/second, single process.

- SQLite calls are synchronous and block the event loop. At this scale, queries are
  sub-millisecond to low-millisecond, and the target throughput is far below saturation.
- Default and status-filtered lists use indexes.
- List requests execute two queries: `COUNT(*)` and the page select. Both use the same
  filters.
- Search uses a leading-wildcard `LIKE`, which scans the table. At 10,000 short rows this
  is acceptable; FTS5 is deferred.
- Sorting by `updated_at` or `title` scans and sorts; acceptable at the target.
- `limit` is capped at 100 to bound response size.
- WAL improves read/write overlap but does not make SQLite a multi-writer database.
- `synchronous=FULL` trades some write latency for durability.
- A manual benchmark with seeded data is part of release verification, but performance
  thresholds are not enforced as flaky CI gates.

Deferred performance work: FTS5 search, cursor pagination, additional sort indexes,
and WAL checkpoint tuning.

---

## 13. Testing strategy

### 13.1 Test layers

| Layer | Scope | Technique |
| --- | --- | --- |
| Unit: schemas | Validation, defaults, strictness, code-point limits | Direct Zod parsing |
| Unit: services | ID/timestamp creation, not-found translation | Fake `TaskRepository` |
| Unit: repository | SQL behavior, search escaping, pagination, idempotency | Real SQLite `:memory:` |
| Unit: migrations | Versioning, idempotency, newer-version failure | Temporary file DB |
| Unit: error mapper | Validation, busy/locked, unknown errors | Direct mapper calls |
| Integration | Full HTTP behavior via Supertest | App with `:memory:` repository |
| Persistence | Survives close/reopen | Temporary directory + file DB |

### 13.2 Isolation

- Every test creates a fresh database — `:memory:` for schema, service, repository, and
  HTTP tests; a temporary file database for migration, persistence, and permission
  tests — runs migrations, builds the app where relevant, and closes the database in
  teardown.
- No test shares a database connection or mutable global state.
- No test reads or writes `./data`.
- Persistence tests use `fs.mkdtemp` and remove the directory afterward.
- No network is used; Supertest binds an ephemeral port internally.

### 13.3 Timestamps

- Tests assert `updatedAt >= previous` rather than strict `>`.
- Where exact timestamps matter, use fake timers or inject a clock into the service.
- Completion idempotency asserts the original `completedAt` and `updatedAt` are preserved.

### 13.4 Coverage and commands

- Core logic target: services + repository + row mapper ≥ 85%.
- `npm run test` runs the suite once.
- `npm run test:coverage` produces the coverage report and enforces thresholds.
- `npm run verify` runs lint, typecheck, and tests in that order.
- Single test: `npx vitest run tests/integration/tasks.test.ts -t "creates a task"`.

---

## 14. Operational runbook

Commands become available in Phase 0 of `PLAN.md`:

```bash
npm ci
npm run dev                 # tsx watch src/server.ts
npm run build
npm start                   # node dist/server.js
npm run verify              # lint -> typecheck -> test
npm run test:coverage
```

- Default URL: `http://127.0.0.1:3000`
- Health: `GET http://127.0.0.1:3000/healthz`
- Database: `./data/tasks.db` by default
- Reset: stop the process, delete `data/`, restart; migrations recreate an empty schema
- Inspect: use the `sqlite3` CLI if installed; it is not a project dependency
- Backup: stop the process and copy the database file, or use SQLite’s backup mechanism
- Logs: JSON on stdout; set `LOG_LEVEL=debug` for development

The README owns the exact setup and curl examples; this document owns the design.

---

## 15. Decision log and trade-offs

| Decision | Chosen | Rejected alternative | Reason |
| --- | --- | --- | --- |
| Runtime | Node 24 LTS | Node 22 | Built-in `node:sqlite` without a flag; current LTS |
| Database driver | `node:sqlite` | `better-sqlite3` | Zero native dependencies; sufficient for one table |
| Storage | SQLite file | In-memory; Postgres | Durability without a server; single-user scale |
| Authentication | None | API key; full accounts | Approved single-user local scope |
| Data access | Explicit SQL | ORM | Small schema; visible query behavior |
| Status model | `todo`/`completed` | `in_progress`; reopen | Matches requested feature set; avoids transition rules |
| Delete | Hard delete | Soft delete | Simpler; no restore requirement |
| Search | `search_text` + `LIKE` | FTS5 | Substring semantics; simpler; adequate at 10k |
| Pagination | Offset | Cursor | Simple page numbers; concurrency accepted |
| Concurrency | Last-write-wins | ETag/version | Single user; no collaboration requirement |
| App wiring | Factory + injection | Module-level singleton | Test isolation; explicit dependencies |
| Durability | WAL + `synchronous=FULL` | `NORMAL` | Meets the “committed before response” requirement |
| Timestamps | Millisecond ISO strings | Epoch integers | Human-readable API; sortable text |

---

## 16. Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| No authentication | Anyone reaching the port controls all tasks | Loopback default; warning; file permissions; document public-deployment gap |
| `node:sqlite` API maturity | Future Node upgrade may change behavior | Pin Node major; repository tests; fallback to `better-sqlite3` |
| Synchronous SQLite blocks event loop | Slow queries delay all requests | Indexed lists; 10k target; cap `limit`; benchmark |
| Leading-wildcard search scans | Slower search as data grows | Accept at 10k; FTS5 deferred |
| Millisecond timestamp collisions | `updatedAt` may not strictly increase | Acceptance uses `>=`; fake timers in tests |
| Offset pagination shifts | Pages can skip/duplicate under writes | Accepted for single-user v1; cursor deferred |
| Accent-insensitive search absent | `cafe` does not match `café` | Documented limitation; normalization only |
| WAL side files | Accidentally committed or backed up | `.gitignore`; close DB cleanly |
| Migration error | Startup failure or schema drift | Transactional migrations; version check; tests |
| Unclean shutdown | WAL recovery or stale files | Signal handlers close server then DB |
| Body/content-type edge cases | Wrong status codes | Explicit middleware and tests |

---

## 17. Deferred work

Future versions may add, behind the same architecture:

- Accounts, authentication, and `owner_id` isolation.
- Teams, sharing, assignments, comments, attachments, and subtasks.
- Due dates, reminders, priorities, tags, and recurring tasks.
- Reopen, soft delete, archive, and audit history.
- Bulk operations and import/export.
- CORS for browser clients, rate limiting, and public deployment hardening.
- FTS5 or another ranked search implementation.
- Cursor pagination and ETag/version-based concurrency.
- OpenAPI generation, Docker images, hosted deployment, and backup tooling.
- A web or mobile client.
