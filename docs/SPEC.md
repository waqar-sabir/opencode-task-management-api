# Task Management API — Specification

**Status:** Approved v1.3 — API v1 complete; companion dashboard added
**Date:** 2026-11-18 (v1.1: 2026-11-19; v1.2: 2026-11-19; v1.3: 2026-11-22)
**Scope:** Single-user local HTTP API with a companion web dashboard
**Related documents:** [`ARCHITECTURE.md`](./ARCHITECTURE.md), [`PLAN.md`](./PLAN.md)

---

## 1. Purpose

Define the business and functional contract for a small HTTP API that lets one
individual manage a personal task list. The API provides task creation, retrieval,
editing, deletion, search, status filtering, and completion, with durable local
persistence.

The project also ships a companion React dashboard in `dashboard/` that consumes the
same API from a browser. The dashboard is a client, not a second backend: it adds no
endpoints and no server-side behavior.

This document is the source of truth for externally observable behavior. Implementation
details live in `ARCHITECTURE.md`; delivery order lives in `PLAN.md`.

---

## 2. Business context

The target user tracks personal tasks and wants a small, dependable API they can call
from scripts, a CLI, or a future client. Existing task tools are heavier than necessary:
they require accounts, synchronization, or hosted services. The project instead provides
a local service with a simple JSON contract and a single SQLite file.

The API is intentionally not a team product. There is no account system and no
multi-user isolation in v1. The trust boundary is the local machine.

A companion dashboard provides a browser UI for the same list. It is served from the
same origin as the API in local development so the API can keep its no-CORS posture.

---

## 3. Goals

1. Provide complete task CRUD with predictable HTTP semantics.
2. Persist tasks across process and machine restarts on the same machine.
3. Support fast retrieval through pagination, free-text search, and status filtering.
4. Record completion time and make completion safe to retry.
5. Keep the operational footprint to Node.js plus one SQLite file.
6. Produce a contract that is easy to test, document, and extend.
7. Provide a local, keyboard-accessible dashboard that exercises the public API
   without changing it.

---

## 4. Non-goals

The following are explicitly out of scope for v1:

- User accounts, authentication, authorization, or per-user isolation.
- Teams, sharing, assignments, comments, attachments, or subtasks.
- Due dates, reminders, priorities, tags, or recurring tasks.
- Reopening a completed task; completion is one-way.
- Soft delete, archive, restore, or audit history.
- Bulk create/update/delete or import/export.
- CORS support, rate limiting, or public deployment hardening. The dashboard is
  same-origin, so no CORS headers are added.
- Real-time updates, webhooks, or push notifications.
- Mobile or desktop native clients, hosted multi-user dashboards, or offline mode.
- Dashboard features that are not backed by the API, such as drag-and-drop ordering,
  bulk edits, or client-side task storage.
- Full-text relevance ranking or accent-insensitive search.
- Multi-instance deployment or horizontal scaling.
- OpenAPI generation, container images, or hosted infrastructure.

---

## 5. User and operating model

| Item | Decision |
| --- | --- |
| User | One individual |
| Tenancy | One task list per running instance |
| Authentication | None |
| Default bind address | `127.0.0.1` |
| Storage | Local SQLite file, default `./data/tasks.db` |
| External services | None |
| Concurrency | Single process; last-write-wins |
| Dashboard | Separate React SPA in `dashboard/`, same origin as the API via a proxy |
| Dashboard persistence | None; task data is fetched from the API and never stored in the browser |
| Target scale | ≤ 10,000 tasks and ≤ 10 requests/second per instance |

Because there is no authentication, exposing the port beyond localhost gives anyone who
can reach it full read/write access. The default configuration must remain loopback-only.

---

## 6. Approved decisions

| ID | Decision |
| --- | --- |
| **D1** | Single-user API; no authentication; localhost-only by default |
| **D2** | SQLite file persistence; in-memory SQLite only in tests |
| **D3** | Statuses are `todo` and `completed`; no reopen |
| **D4** | `PATCH` edits title/description only; completion has a dedicated endpoint |
| **D5** | Hard delete; no archive or restore |
| **D6** | Case-insensitive substring search over title and description, combined with status using `AND` |
| **D7** | Offset pagination; default `createdAt desc`; maximum `limit=100` |
| **D8** | Title 1–200, description 0–2000; unknown fields rejected |
| **D9** | No CORS, rate limiting, bulk operations, teams, sharing, or assignments |
| **D10** | Single instance; target ≤ 10,000 tasks and ≤ 10 requests/second |
| **D11** | The companion dashboard is a separate React/Vite SPA that consumes only `/api/v1` and `/healthz`; no API changes |
| **D12** | Dashboard and API share an origin through a dev/preview proxy or reverse proxy; the API still sends no CORS headers |

---

## 7. Assumptions

1. One task list is shared by every client of the running instance; there is no owner field.
2. The machine clock is the source of truth for timestamps.
3. Timestamps have millisecond precision; two updates within the same millisecond may
   have equal `updatedAt` values.
4. Task titles and descriptions may contain arbitrary Unicode, but API messages are English.
5. Search is case-insensitive but not accent-insensitive: `cafe` does not match `café`.
6. Duplicate titles are allowed.
7. Completed tasks remain editable and deletable.
8. A task may only become completed; it cannot return to `todo`.
9. Pagination is offset-based; concurrent inserts/deletes may shift page contents.
10. No external service is needed to run or test the API.
11. The SQLite file is the durable system of record; deleting it deletes all tasks.
12. Only one API process writes to a database file at a time.
13. The dashboard is served from the same origin as the API, or behind a proxy that
    forwards `/api` and `/healthz`.
14. Dashboard UI state (filters, page, open dialogs) is ephemeral and is never a source
    of truth.

---

## 8. Business requirements

| ID | Requirement |
| --- | --- |
| **BR-1** | A single individual can manage a private task list over HTTP without accounts, teams, or sharing. |
| **BR-2** | Tasks persist across process and machine restarts on the same machine. |
| **BR-3** | Creating a task requires only a title; description is optional. |
| **BR-4** | Users can list, view, edit, delete, search, filter, and complete tasks. |
| **BR-5** | Completion records when the task was completed and is safe to retry. |
| **BR-6** | The API runs locally with no external services and is not exposed by default. |
| **BR-7** | Every response is predictable, versioned, and validated consistently. |
| **BR-8** | One developer can run, test, reset, and extend the project without specialized infrastructure. |
| **BR-9** | A single user can manage tasks from a local web dashboard without a separate account or service. |

---

## 9. Task model

### 9.1 Fields

| Field | Type | Rules |
| --- | --- | --- |
| `id` | string | Server-generated UUID v4; immutable; never accepted from clients |
| `title` | string | Required; trimmed; 1–200 Unicode code points after trimming |
| `description` | string | Optional; defaults to `""`; 0–2000 Unicode code points; stored as supplied |
| `status` | string | `todo` or `completed`; new tasks are `todo` |
| `createdAt` | string | ISO 8601 UTC with milliseconds; server-generated; immutable |
| `updatedAt` | string | ISO 8601 UTC with milliseconds; server-generated; refreshed on accepted mutations |
| `completedAt` | string \| null | ISO 8601 UTC with milliseconds; non-null iff `status=completed` |

The internal search column `search_text` is not part of the API representation. See
`ARCHITECTURE.md` §7.

### 9.2 Invariants

1. `id` and `createdAt` never change.
2. `updatedAt` is never earlier than the previous value under a normal system clock; it
   may be equal when two writes occur in the same millisecond.
3. `completedAt` is non-null if and only if `status=completed`.
4. Completing an already-completed task does not change `completedAt` or `updatedAt`.
5. `PATCH` cannot change `id`, `status`, `createdAt`, `updatedAt`, or `completedAt`.
6. Title and description limits are measured in Unicode code points, not UTF-16 units.
7. Deleting a task removes it from every read, search, and filter result.
8. Unknown request fields are rejected rather than ignored.
9. Bodyless actions reject any supplied request body.

### 9.3 Status lifecycle

```text
create ──► todo ──POST /complete──► completed
                                  (terminal)
```

- There is no transition from `completed` back to `todo`.
- Repeating `/complete` is a successful no-op.
- Deleting works in either state.

---

## 10. Functional requirements

| ID | Requirement | Behavior |
| --- | --- | --- |
| **FR-1** | Create task | `POST /api/v1/tasks`; title required; description optional; returns `201` and `Location`; server sets `id`, `status=todo`, timestamps |
| **FR-2** | List tasks | `GET /api/v1/tasks`; paginated; supports search, status filter, and sorting; includes completed tasks by default |
| **FR-3** | View details | `GET /api/v1/tasks/:id`; returns the task or `404` |
| **FR-4** | Edit details | `PATCH /api/v1/tasks/:id`; accepts `title` and/or `description`; refreshes `updatedAt`; rejects status and timestamps |
| **FR-5** | Delete task | `DELETE /api/v1/tasks/:id`; permanent; `204`; subsequent access returns `404` |
| **FR-6** | Mark complete | `POST /api/v1/tasks/:id/complete`; sets `status=completed` and `completedAt`; idempotent |
| **FR-7** | Search | `q` matches title or description, case-insensitively, as a substring; `%`, `_`, and `\` are literal |
| **FR-8** | Filter by status | `status=todo\|completed`; exactly one value; combinable with search |
| **FR-9** | Persistence | SQLite file; migrations on startup; successful writes committed before the response |
| **FR-10** | Health | `GET /healthz`; verifies storage with `SELECT 1` |
| **FR-11** | Validation and errors | Reject unknown fields and query parameters; one error envelope for all failures |
| **FR-12** | Dashboard | `dashboard/` provides create, list, search, status filter, sort, pagination, edit, complete, delete, summary counts, and API health through the public API; completed tasks cannot be reopened |

---

## 11. API contract

### 11.1 Conventions

- Base path: `/api/v1`
- Media type: `application/json; charset=utf-8`
- Timestamps: ISO 8601 UTC, millisecond precision, trailing `Z`
- IDs: UUID v4 strings
- Authentication: none
- CORS: none
- Response bodies are UTF-8 JSON except `204 No Content`.
- Single-task responses return the task object directly; list responses use a page envelope.
- `POST` and `PATCH` requests that carry a body require
  `Content-Type: application/json`. Bodyless actions such as
  `POST /api/v1/tasks/:id/complete` need no content type and reject any
  supplied request body with `400 VALIDATION_ERROR`.
- Request bodies are limited to 100 KB.
- The dashboard consumes this contract unchanged. It adds no endpoints, headers, or
  CORS behavior.

### 11.2 Endpoints

| Method | Path | Success | Notes |
| --- | --- | --- | --- |
| `POST` | `/api/v1/tasks` | `201` | `Location: /api/v1/tasks/{id}`; returns created task |
| `GET` | `/api/v1/tasks` | `200` | List, search, filter, sort, paginate |
| `GET` | `/api/v1/tasks/:id` | `200` | Returns task |
| `PATCH` | `/api/v1/tasks/:id` | `200` | Partial content update |
| `DELETE` | `/api/v1/tasks/:id` | `204` | No request or response body |
| `POST` | `/api/v1/tasks/:id/complete` | `200` | No request body; idempotent; returns updated task |
| `GET` | `/healthz` | `200` | `{ "status": "ok" }` |

### 11.3 Create task

Request:

```json
{
  "title": "Prepare release notes",
  "description": "Cover the API changes."
}
```

- `title`: required string; trimmed; 1–200 code points after trimming.
- `description`: optional string; defaults to `""`; 0–2000 code points.
- `null` is not accepted for either field.
- Any other field is rejected.

Success: `201 Created`, `Location` header, and the created task.

### 11.4 List tasks

Query parameters:

| Parameter | Default | Rules |
| --- | --- | --- |
| `q` | omitted | Trimmed; ≤ 200 code points; case-insensitive substring over title and description |
| `status` | omitted | `todo` or `completed`; repeated parameter returns `400` |
| `page` | `1` | Integer ≥ 1 |
| `limit` | `20` | Integer 1–100 |
| `sort` | `createdAt` | `createdAt`, `updatedAt`, or `title` |
| `order` | `desc` | `asc` or `desc` |

- Unknown query parameters return `400`.
- `q` and `status` combine with `AND`.
- `sort` ties are broken by `id` in the same direction as `order`.
- A page beyond the last returns `200` with an empty `items` array and the correct `total`.
- `total` is the number of tasks matching the filters, independent of page size.

Response:

```json
{
  "items": [],
  "page": 1,
  "limit": 20,
  "total": 0
}
```

### 11.5 View task

- Existing ID: `200` with the task.
- Malformed UUID: `400`.
- Valid but unknown UUID: `404`.

### 11.6 Edit task

Request fields: any subset of `title` and `description`.

- At least one recognized field is required.
- An empty body returns `400`.
- `title` follows the create rules.
- `description` follows the create rules; an empty string clears it.
- `status`, `id`, `createdAt`, `updatedAt`, and `completedAt` are rejected.
- Any unknown field is rejected.
- `createdAt` and `id` are unchanged.
- `updatedAt` is refreshed to the current server time.
- Editing a completed task preserves `status` and `completedAt`.

Success: `200` with the updated task.

### 11.7 Delete task

- Existing ID: `204` with no body.
- The task is removed from all subsequent reads, searches, and filters.
- Deleting the same task again returns `404`.
- Completed tasks are deletable.
- Any supplied request body returns `400 VALIDATION_ERROR`.

### 11.8 Complete task

- `todo` task: `200`; `status=completed`; `completedAt` set to the server time;
  `updatedAt` refreshed.
- Already completed: `200`; original `completedAt` and `updatedAt` preserved.
- Unknown ID: `404`.
- Malformed ID: `400`.
- No other task is affected.

### 11.9 Health

- `GET /healthz` is unversioned.
- `200` with `{ "status": "ok" }` when storage responds to `SELECT 1`.
- `503` with the standard error envelope when storage is unavailable.
- No authentication.

### 11.10 Error contract

Every error response uses:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "details": [
      { "path": "title", "message": "Title is required" }
    ]
  }
}
```

| Code | HTTP | When |
| --- | --- | --- |
| `VALIDATION_ERROR` | `400` | Invalid JSON, body, query, UUID, or field values |
| `NOT_FOUND` | `404` | Valid UUID with no task; unknown route |
| `PAYLOAD_TOO_LARGE` | `413` | Request body over 100 KB |
| `UNSUPPORTED_MEDIA_TYPE` | `415` | `POST`/`PATCH` with a body but without `application/json` |
| `STORAGE_UNAVAILABLE` | `503` | SQLite busy/locked beyond the configured timeout |
| `INTERNAL_ERROR` | `500` | Unexpected failure; details are logged, never returned |

`details` is present only for validation errors. Internal errors never expose SQL,
stack traces, file paths, or task content.

### 11.11 Validation summary

| Input | Rule | Failure |
| --- | --- | --- |
| Task ID | Valid UUID | `400` |
| `title` | String; trimmed; 1–200 code points | `400` |
| `description` | String; 0–2000 code points | `400` |
| Task body | Only `title`, `description` | `400` for unknown fields |
| Update body | At least one of `title`, `description` | `400` |
| `q` | String; trimmed; ≤ 200 code points | `400` |
| `status` | Exactly one of `todo`, `completed` | `400` |
| `page` | Integer ≥ 1 | `400` |
| `limit` | Integer 1–100 | `400` |
| `sort` | `createdAt`, `updatedAt`, `title` | `400` |
| `order` | `asc`, `desc` | `400` |
| Query string | Only the parameters above | `400` |
| Body size | ≤ 100 KB | `413` |
| Content type | `application/json` for `POST`/`PATCH` bodies | `415` |

---

## 12. Search, filter, sort, and pagination semantics

### 12.1 Search

- Terms are matched against both title and description.
- Matching is case-insensitive, including non-ASCII case pairs such as `CAFÉ`/`café`.
- Matching is substring-based, not whole-word or prefix-only.
- `%`, `_`, and `\` in `q` match literally.
- `q` is trimmed; an empty or whitespace-only value behaves as omitted.
- `q` longer than 200 code points returns `400`.
- Accent-insensitive matching is not provided.
- Search includes completed tasks unless `status` narrows the result.

### 12.2 Filter

- `status=todo` returns only incomplete tasks.
- `status=completed` returns only completed tasks.
- Repeating the parameter or using any other value returns `400`.
- Filtering combines with search using `AND`.

### 12.3 Sort

- `createdAt` (default), `updatedAt`, or `title`.
- `order` is `asc` or `desc`; default `desc`.
- `title` sorting is case-insensitive for ASCII via `COLLATE NOCASE`; non-ASCII order
  follows SQLite code-point ordering.
- `id` is the tie-breaker, in the same direction as `order`.

### 12.4 Pagination

- `page` starts at 1.
- `limit` defaults to 20 and is capped at 100.
- Offset is `(page - 1) * limit`.
- Pagination applies after search and filter.
- Offset pagination may shift under concurrent writes; this is accepted for v1.

---

## 13. Dashboard client

### 13.1 Scope

`dashboard/` is a separate React single-page application. It is a first-party client of
the API described above, not a second server. It adds no database access, no endpoints,
no authentication, and no CORS.

The dashboard must remain usable when served from the same origin as the API. In
development and preview, Vite proxies `/api` and `/healthz` to the API. A deployment
that serves the built dashboard must do the same at its reverse proxy.

### 13.2 Features

| ID | Feature | Behavior |
| --- | --- | --- |
| **UI-1** | List | Shows the current page with title, description, status, and updated/completed times |
| **UI-2** | Create | Modal form; title required; description optional; same 1–200 / 0–2000 code-point limits as the API |
| **UI-3** | Edit | Modal form; sends only changed content fields; completion status and `completedAt` are preserved by the API |
| **UI-4** | Complete | Marks a `todo` task complete; completed tasks are shown as terminal and cannot be reopened |
| **UI-5** | Delete | Requires explicit confirmation; removes the task from the current view |
| **UI-6** | Search | Debounced text search over titles and descriptions; empty results show a clear empty state |
| **UI-7** | Filter | All, To do, and Completed; combines with search exactly as the API does |
| **UI-8** | Sort and paginate | `createdAt`, `updatedAt`, or `title`; ascending or descending; 10, 20, 50, or 100 per page |
| **UI-9** | Summary | Total, to-do, completed, and completion percentage from the unfiltered task set |
| **UI-10** | Health | Shows whether `/healthz` is reachable and offers a manual recheck |
| **UI-11** | Errors | Displays the API error code, message, validation details, and a retry action |
| **UI-12** | States | Loading skeletons, refreshing state, empty states, and confirmation dialogs |

### 13.3 Data and state rules

- Every read and write goes through the documented API; the dashboard never opens SQLite.
- Task content is not written to `localStorage`, `sessionStorage`, cookies, or the URL.
- Filters, sort, page, and dialogs are in-memory UI state and reset on reload.
- Mutations refetch the visible page and the summary counts; the dashboard does not
  assume success before the API confirms it.
- Search input is debounced by 300 ms.
- Changing search, status, sort, order, or page size resets the view to page 1.
- Summary counts come from three `limit=1` list calls: all, `todo`, and `completed`.
- A completed task has no complete action; there is no reopen control.

### 13.4 Accessibility and presentation

- All controls are keyboard reachable and have accessible names.
- Dialogs move focus to the first field or the safe action, keep Tab inside, close on
  Escape, and restore focus.
- Mutation results are announced with a live region.
- Layout is responsive from 360 px upward and supports light and dark color schemes.
- Motion respects `prefers-reduced-motion`.

### 13.5 Out of scope for the dashboard

Offline mode, real-time updates, drag-and-drop ordering, bulk actions, attachments,
authentication, and per-user views are not part of v1.3.

---

## 14. Non-functional requirements

| ID | Requirement | Target |
| --- | --- | --- |
| **NFR-1** | Performance | CRUD p95 ≤ 100 ms; list/search p95 ≤ 200 ms at 10,000 tasks on a laptop; manual benchmark, not a flaky CI gate |
| **NFR-2** | Durability | A successful write is committed to SQLite before the response; data survives restart |
| **NFR-3** | Integrity | Database `CHECK` constraints plus service invariants; `completedAt` non-null iff completed |
| **NFR-4** | Security | Localhost binding, 100 KB body cap, parameterized SQL, no secrets, no task content in logs, generic `500`s |
| **NFR-5** | Observability | One-line JSON logs with request ID, method, path, status, and duration; no query values or body content |
| **NFR-6** | Maintainability | Strict TypeScript; layered boundaries; `npm run verify` green; core logic coverage ≥ 85% |
| **NFR-7** | Portability | Node 24; built-in SQLite; no native add-ons; macOS/Linux primary |
| **NFR-8** | API contract | `/api/v1`; JSON UTF-8; ISO 8601 UTC; stable error shape |
| **NFR-9** | Scale | Single process; 10,000 tasks; 10 requests/second; horizontal scaling out of scope |
| **NFR-10** | Test isolation | Fresh database per test: `:memory:` for schema, service, repository, and HTTP tests; a temporary directory with a file database for migration, persistence, and permission tests. No shared mutable state; no test reads or writes `./data` |
| **NFR-11** | Dashboard quality | React 19 + Vite, strict TypeScript, `npm --prefix dashboard run verify` green; no UI framework |
| **NFR-12** | Dashboard accessibility | Keyboard operation, focus management, accessible names, live announcements, reduced motion, responsive to 360 px |
| **NFR-13** | Dashboard security | Same-origin only; no CORS; no secrets or tokens; no task content in browser storage or the URL |

---

## 15. Acceptance criteria

### Global

- **G1** From a clean clone, install and `npm run verify` pass without a pre-existing database.
- **G2** README commands start the API and dashboard and demonstrate every endpoint.
- **G3** Every error uses the envelope; no stack traces or SQL text reach the client.
- **G4** Unknown body fields and query parameters return `400`.
- **G5** All timestamps are ISO 8601 UTC with milliseconds and a trailing `Z`.
- **G6** No secrets, `.env`, `data/`, or SQLite side files are tracked.
- **G7** The server binds `127.0.0.1` by default; any non-loopback `HOST` logs a no-auth warning.
- **G8** Logs include request ID, method, path, status, and duration; they exclude titles, descriptions, and `q`.
- **G9** Requests without credentials succeed; all clients share one task list, as documented.
- **G10** `SIGINT`/`SIGTERM` closes the server and database cleanly; restart succeeds.
- **G11** SQLite busy/locked beyond the timeout returns `503 STORAGE_UNAVAILABLE`.
- **G12** Unexpected failures return `500 INTERNAL_ERROR` without implementation details.
- **G13** On POSIX, the data directory is created with mode `0700` and the database file with mode `0600`.
- **G14** The dashboard builds and its lint, typecheck, and tests pass from a clean install; it adds no API route, schema, header, or CORS behavior.
- **G15** The dashboard works with only the documented endpoints and shows the standard error envelope.

### Create

- **C1** A valid request returns `201`, a `Location` header, and the created task.
- **C2** New tasks have `status=todo`, `completedAt=null`, and identical `createdAt`/`updatedAt`.
- **C3** Titles are trimmed; whitespace-only titles return `400`; 200 code points succeed; 201 return `400`.
- **C4** Omitted description becomes `""`; 2000 code points succeed; 2001 return `400`.
- **C5** Client-supplied `id`, `status`, `createdAt`, `updatedAt`, or `completedAt` returns `400`.
- **C6** Duplicate titles are accepted.
- **C7** Malformed JSON returns `400`; a non-JSON content type on a request body
  returns `415`; bodies over 100 KB return `413`.
- **C8** The task is immediately retrievable by ID and present in list results.

### List

- **L1** Default request returns `200`, page 1, limit 20, newest first, with `{ items, page, limit, total }`.
- **L2** No tasks returns `200` with `items: []` and `total: 0`.
- **L3** `total` reflects active search/status filters, not page length.
- **L4** `page=0`, `limit=0`, `limit=101`, or non-integer values return `400`.
- **L5** `sort` accepts only `createdAt`, `updatedAt`, `title`; `order` accepts only `asc`, `desc`; invalid values return `400`.
- **L6** Equal sort values are tie-broken by `id`; repeated identical requests return the same order within a stable dataset.
- **L7** Completed tasks appear by default.
- **L8** A page beyond the last returns `200` with empty `items` and the correct `total`.
- **L9** `limit=100` succeeds; `limit=101` returns `400`.

### Detail

- **D1** An existing ID returns the exact task.
- **D2** A malformed UUID returns `400`.
- **D3** A valid but unknown UUID returns `404`.

### Update

- **U1** `PATCH` changes only supplied content fields.
- **U2** `createdAt` and `id` are unchanged; `updatedAt` is refreshed (`>=` previous).
- **U3** An empty body or a body without `title`/`description` returns `400`.
- **U4** `status`, `id`, and timestamps in the body return `400`.
- **U5** Title and description follow the same limits as create.
- **U6** Editing a completed task preserves `status=completed` and the original `completedAt`.
- **U7** Unknown ID returns `404`; malformed ID returns `400`.
- **U8** After a content edit, search reflects the new title or description.

### Delete

- **X1** Deleting an existing task returns `204` with no body.
- **X2** The task disappears from detail, list, search, and filter results.
- **X3** Deleting the same task again returns `404`.
- **X4** Completed tasks can be deleted.

### Complete

- **M1** Completing a `todo` task returns `200` with `status=completed` and a non-null `completedAt`.
- **M2** Completing it again returns `200`, preserves the original `completedAt`, and leaves `updatedAt` unchanged.
- **M3** Unknown ID returns `404`; malformed ID returns `400`.
- **M4** Completing one task does not affect any other task.
- **M5** Completed tasks remain visible in the default list and appear under `status=completed`.

### Search

- **S1** `q` matches titles.
- **S2** `q` matches descriptions.
- **S3** Matching is case-insensitive, including non-ASCII case pairs such as `CAFÉ`/`café`.
- **S4** Matching is substring-based, not whole-word.
- **S5** `%`, `_`, and `\` in `q` match literally.
- **S6** No matches return `200` with `items: []`.
- **S7** Empty or whitespace-only `q` behaves as omitted.
- **S8** `q` longer than 200 code points returns `400`.
- **S9** `q` combines with `status` using `AND`, and pagination applies to the combined result.
- **S10** Completed tasks are searchable by default.

### Filter

- **F1** `status=todo` returns only incomplete tasks.
- **F2** `status=completed` returns only completed tasks.
- **F3** Any other status value, or a repeated status parameter, returns `400`.
- **F4** Search and status filter combine correctly and report the correct `total`.

### Persistence

- **P1** The database file is created at `DATABASE_PATH`; a missing parent directory is created automatically.
- **P2** Create, update, complete, and delete survive a close/reopen cycle.
- **P3** A fresh database reports `user_version=1` after migration.
- **P4** Reopening an existing database does not duplicate schema objects or data.
- **P5** A database whose `user_version` is newer than the code fails startup with a clear error.
- **P6** File databases open in WAL mode with `busy_timeout` configured.
- **P7** Tests use `:memory:` except migration, persistence, and permission tests, which use a temporary directory; none touch `./data`.
- **P8** `data/`, `*.db`, `*.db-wal`, and `*.db-shm` are gitignored.
- **P9** Deleting the database file and restarting recreates an empty, migrated database.

### Health

- **H1** `/healthz` returns `200` with `{ "status": "ok" }` when storage responds.
- **H2** `/healthz` returns `503` when the storage check fails.

### Dashboard

- **UI1** The dashboard loads tasks and reports API health.
- **UI2** Creating a task with a title and optional description adds it to the list.
- **UI3** Search filters by title and description after the debounce; no matches show an empty state.
- **UI4** Status filters and summary counts stay consistent with the API.
- **UI5** Sorting and pagination request the documented parameters and render the returned page.
- **UI6** Editing sends only changed content fields and preserves completion.
- **UI7** Completing a task updates it in place and removes the complete action; there is no reopen.
- **UI8** Deleting requires confirmation and removes the task.
- **UI9** API failures show code, message, validation details when present, and a retry action.
- **UI10** Loading, refreshing, empty, and no-match states are distinct.
- **UI11** Dialogs trap focus, close on Escape, and restore focus; controls have accessible names.
- **UI12** Layout works at 360 px, in light and dark schemes, with reduced motion respected.
- **UI13** No task content is persisted in browser storage or the URL, and the API adds no CORS headers.

---

## 16. Traceability

| Requirement | Acceptance criteria |
| --- | --- |
| FR-1 Create | C1–C8 |
| FR-2 List | L1–L9, S1–S10, F1–F4 |
| FR-3 Detail | D1–D3 |
| FR-4 Edit | U1–U8 |
| FR-5 Delete | X1–X4 |
| FR-6 Complete | M1–M5 |
| FR-7 Search | S1–S10 |
| FR-8 Filter | F1–F4 |
| FR-9 Persistence | P1–P9 |
| FR-10 Health | H1–H2 |
| FR-11 Validation/errors | G3–G5, G11–G12, C5, C7, L4, L5 |
| NFR-1 Performance | Manual benchmark in `PLAN.md` |
| NFR-2 Durability | P1–P2 |
| NFR-3 Integrity | C2, M1–M2, U6 |
| NFR-4 Security | G6–G8, G13 |
| NFR-5 Observability | G8 |
| NFR-6 Maintainability | G1 |
| NFR-7 Portability | G1, P1–P9 |
| NFR-8 API contract | G3–G5 |
| NFR-9 Scale | Manual benchmark |
| NFR-10 Test isolation | P7 |
| FR-12 Dashboard | UI1–UI13 |
| BR-9 Dashboard | UI1–UI12 |
| NFR-11 Dashboard quality | UI1–UI13 |
| NFR-12 Accessibility | UI11–UI12 |
| NFR-13 Dashboard security | UI13 |

---

## 17. Change control

- This specification is approved for v1.
- **v1.1 (2026-11-19):** `POST`/`PATCH` require `application/json` only when the
  request carries a body. Bodyless actions such as task completion no longer
  require a content type. Affects §11.1, §11.10, §11.11, and C7.
- **v1.3 (2026-11-22):** Adds the companion dashboard as a separate same-origin client.
  No API behavior, fields, limits, or error codes change; the API still has no CORS.
  Affects §1–§8, §10–§11, the new §13, and §14–§17.
- Any change to HTTP behavior, data fields, status semantics, search behavior, or limits
  requires a specification update and re-approval.
- Implementation phases and task ordering may change without altering this contract.
- `ARCHITECTURE.md` may change implementation details as long as this specification’s
  observable behavior is preserved.
