# Task Management API

A single-user task management API that runs locally with Node.js 24 and one
SQLite file. No accounts, no external services, no build step required in
development.

> **Status:** v1.1 complete. See [`docs/SPEC.md`](docs/SPEC.md) for the behavior
> contract and [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md) for the verification
> record. The dashboard is a companion React SPA in `dashboard/`.

## Requirements

- Node.js 24 LTS (pinned in `.nvmrc`; `package.json` requires `>=24`)
- npm (the lockfile is committed)
- A running API server (default `http://127.0.0.1:3000`)

## Setup

```bash
npm ci
```

Every setting has a default, so the API runs without a `.env` file. To override
defaults, copy the example and edit it:

```bash
cp .env.example .env
```

### Dashboard setup

```bash
npm ci --prefix dashboard
```

## Configuration

| Variable | Default | Accepted values |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development`, `test`, `production` |
| `PORT` | `3000` | integer `1`–`65535` |
| `HOST` | `127.0.0.1` | any bind address; non-loopback values log a no-auth warning |
| `DATABASE_PATH` | `./data/tasks.db` | file path, or `:memory:` for tests |
| `LOG_LEVEL` | `info` | `trace`, `debug`, `info`, `warn`, `error`, `fatal` |

### Dashboard proxy environment

| Variable | Default | Accepted values |
| --- | --- | --- |
| `TASK_API_URL` | `http://127.0.0.1:3000` | API base URL, e.g. `http://127.0.0.1:3100` |
| `VITE_API_BASE_URL` | `/api/v1` | API path prefix; absolute URL supported |
| `VITE_HEALTH_URL` | `/healthz` | Health endpoint path |

Invalid configuration fails fast at startup with a clear error.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start API with `tsx watch` |
| `npm --prefix dashboard run dev` | Start dashboard Vite on 5173, proxying the API |
| `npm run build` | Compile API to `dist/` |
| `npm --prefix dashboard run build` | Build dashboard static bundle |
| `npm start` | Run the compiled build (run `npm run build` first) |
| `npm run lint` | ESLint (root; ignores `dashboard/`) |
| `npm --prefix dashboard run lint` | Dashboard ESLint |
| `npm run format` | Prettier write (root; ignores `dashboard/`) |
| `npm --prefix dashboard run format` | Dashboard Prettier |
| `npm run format:check` | Prettier check |
| `npm run format:check:dashboard` | Dashboard format check |
| `npm run typecheck` | `tsc --noEmit` |
| `npm --prefix dashboard run typecheck` | Dashboard typecheck |
| `npm test` | Run the API test suite once |
| `npm --prefix dashboard run test` | Run the dashboard test suite |
| `npm run test:coverage` | Coverage report with 85% API thresholds |
| `npm run test:dashboard:coverage` | Dashboard coverage with 80% thresholds |
| `npm run verify` | lint → typecheck → test (API) |
| `npm run verify:dashboard` | lint → typecheck → test (dashboard) |
| `npm run verify:all` | API and dashboard lint, typecheck, and tests |
| `npm run benchmark` | Seed 10,000 tasks and measure API latency |

Run `npm run verify` before opening a change. Run `npm run verify:all` to verify both
the API and the dashboard.

## Run

```bash
npm run dev
```

```text
{"level":30,...,"url":"http://127.0.0.1:3000","msg":"listening"}
```

For a throwaway database and a different port:

```bash
DATABASE_PATH=/tmp/task-api/tasks.db PORT=3001 npm run dev
```

Stop the process with `Ctrl+C`. `SIGINT` and `SIGTERM` both drain in-flight
requests, close SQLite, and exit cleanly; data survives the restart.

## API

All task endpoints live under `/api/v1`. Every response includes an
`X-Request-Id` header; send your own and it is echoed back and used in logs.
Request and response bodies are JSON. `POST`/`PATCH` require
`Content-Type: application/json` when a body is present; bodyless actions such
as completion do not.

### Create a task

```bash
curl -i -X POST http://127.0.0.1:3000/api/v1/tasks \
  -H 'Content-Type: application/json' \
  -d '{"title":"Prepare release notes","description":"Cover the API changes."}'
```

- `201 Created` with a `Location` header and the task body.
- `title` is required, trimmed, and limited to 200 code points.
- `description` is optional (default `""`) and limited to 2000 code points.
- New tasks start as `todo` with `completedAt: null` and identical
  `createdAt`/`updatedAt`.
- Client-supplied `id`, `status`, or timestamps return `400`.

### List tasks

```bash
curl 'http://127.0.0.1:3000/api/v1/tasks'
curl 'http://127.0.0.1:3000/api/v1/tasks?page=2&limit=5'
```

```json
{ "items": [], "page": 1, "limit": 20, "total": 0 }
```

Defaults: page `1`, limit `20`, sort `createdAt` descending (newest first).
`total` counts the filtered result, not the page. A page beyond the end returns
`200` with `items: []`.

| Parameter | Values |
| --- | --- |
| `q` | search term, up to 200 code points |
| `status` | `todo` or `completed` |
| `sort` | `createdAt`, `updatedAt`, or `title` |
| `order` | `asc` or `desc` |
| `page` | integer `>= 1` |
| `limit` | integer `1`–`100` |

Unknown or repeated parameters return `400`.

### Search, filter, and sort

```bash
curl 'http://127.0.0.1:3000/api/v1/tasks?q=release'
curl 'http://127.0.0.1:3000/api/v1/tasks?status=todo'
curl 'http://127.0.0.1:3000/api/v1/tasks?q=release&status=todo'
curl 'http://127.0.0.1:3000/api/v1/tasks?sort=title&order=asc'
```

- Search is a case-insensitive substring match over title and description,
  including non-ASCII case pairs (`CAFÉ` matches `café`).
- `%`, `_`, and `\` match literally.
- Empty or whitespace-only `q` behaves as if omitted.
- Search and `status` combine with `AND`; pagination applies to the combined
  result.
- Completed tasks are included by default and searchable.

### Get a task

```bash
curl http://127.0.0.1:3000/api/v1/tasks/<uuid>
```

`200` with the task; `400` for a malformed UUID; `404` for an unknown one.

### Update a task

```bash
curl -X PATCH http://127.0.0.1:3000/api/v1/tasks/<uuid> \
  -H 'Content-Type: application/json' \
  -d '{"title":"Updated title"}'
```

Send at least one of `title` or `description`. Both follow the create limits.
`id` and `createdAt` never change; `updatedAt` advances. Editing a completed task
keeps `status=completed` and its original `completedAt`. `400` when no content
field is supplied or a protected field is present; `404` for an unknown task.

### Complete a task

```bash
curl -X POST http://127.0.0.1:3000/api/v1/tasks/<uuid>/complete
```

`200` with `status=completed` and a non-null `completedAt`. Repeating the call is
an idempotent success: `completedAt` and `updatedAt` keep their original values.
There is no transition back to `todo`. There is no request body, so no
`Content-Type` header is needed.

### Delete a task

```bash
curl -i -X DELETE http://127.0.0.1:3000/api/v1/tasks/<uuid>
```

`204` with an empty body. Deleting again returns `404`. Completed tasks can be
deleted. Deleted tasks disappear from detail, list, search, and filter results.

### Health check

```bash
curl -i http://127.0.0.1:3000/healthz
```

`200 {"status":"ok"}` when storage responds; `503` when the SQLite probe fails.
The health endpoint is intentionally unversioned.

### Errors

Every error uses the same envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "details": [{ "path": "title", "message": "Too long" }]
  }
}
```

`details` appears only for validation failures.

| Status | Code | When |
| --- | --- | --- |
| `400` | `VALIDATION_ERROR` | Bad body, query, param, or malformed JSON |
| `404` | `NOT_FOUND` | No task with that ID, or unknown route |
| `413` | `PAYLOAD_TOO_LARGE` | Request body over 100 KB |
| `415` | `UNSUPPORTED_MEDIA_TYPE` | Write body without `application/json` |
| `503` | `STORAGE_UNAVAILABLE` | SQLite busy/locked or health probe failure |
| `500` | `INTERNAL_ERROR` | Unexpected failure; no stack traces or SQL text leak |

```bash
curl -i http://127.0.0.1:3000/api/v1/tasks/not-a-uuid          # 400
curl -i http://127.0.0.1:3000/api/v1/tasks?limit=101           # 400
curl -i -X POST http://127.0.0.1:3000/api/v1/tasks \
  -H 'Content-Type: text/plain' -d '{"title":"x"}'             # 415
```

## Database

The SQLite file lives at `DATABASE_PATH` (default `./data/tasks.db`). On POSIX
the parent directory is created with mode `0700` and the file with mode `0600`.
The database opens in WAL mode with a 5-second busy timeout and `foreign_keys`
enabled.

Reset by deleting the data directory while the server is stopped:

```bash
rm -rf data/
```

The directory and schema are recreated on the next start. To back up, stop the
server and copy the `.db` file (and any `-wal`/`-shm` side files); to move the
database, point `DATABASE_PATH` at the copy.

Schema migrations run automatically at startup. A database written by a newer
build fails startup with a clear version error instead of being modified.

## Dashboard

The dashboard is a same-origin React SPA served from `dashboard/` and built with
Vite. It consumes the documented `/api/v1` endpoints and never opens SQLite.

### Starting the dashboard

```bash
npm --prefix dashboard run dev
```

The dashboard starts on `http://127.0.0.1:5173` and proxies `/api` and `/healthz`
to the API (default `http://127.0.0.1:3000`). Open `http://127.0.0.1:5173` in
your browser.

### Dashboard features

- List tasks with title, description, status, and timestamps
- Create and edit tasks via a modal form
- Complete and delete tasks with confirmation dialogs
- Search over titles and descriptions (300 ms debounced)
- Filter by todo/completed status
- Sort by createdAt, updatedAt, or title; ascending or descending
- Pagination with 10, 20, 50, or 100 per page
- Summary cards with total, to-do, completed, and completion percentage
- Health indicator with manual recheck
- Responsive layout from 360 px upward; light and dark themes
- Reduced-motion preference respected
- Accessible dialogs with focus trap, Escape, and focus restoration
- Live-region toasts for mutation results
- No task content persisted in browser storage, cookies, or the URL

## Documentation

- [`docs/SPEC.md`](docs/SPEC.md) — behavior and acceptance criteria
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — design and boundaries
- [`docs/PLAN.md`](docs/PLAN.md) — delivery plan and phase gates
- [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md) — criterion-by-criterion verification
- [`dashboard/README.md`](dashboard/README.md) — dashboard setup and features
- `docs/dashboard.png` — screenshot of the dashboard (desktop, light theme)

## Security

There is no authentication. The server binds to loopback by default; anyone who
can reach the port can read and modify every task. Do not expose it to a network.
A non-loopback `HOST` logs a warning at startup. Logs contain request ID, method,
path, status, and duration, but never task content, request bodies, or query
strings.

The dashboard shares the same-origin boundary. It never writes task content to
`localStorage`, `sessionStorage`, cookies, or the URL, and it adds no CORS
headers to the API.
