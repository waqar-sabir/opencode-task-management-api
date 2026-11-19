# Task Management API — Specification

**Status:** Approved v1.1 — implementation in progress (Phases 0–3 complete)
**Date:** 2026-11-18 (v1.1: 2026-11-19)
**Scope:** Single-user local HTTP API
**Related documents:** [`ARCHITECTURE.md`](./ARCHITECTURE.md), [`PLAN.md`](./PLAN.md)

---

## 1. Purpose

Define the business and functional contract for a small HTTP API that lets one
individual manage a personal task list. The API provides task creation, retrieval,
editing, deletion, search, status filtering, and completion, with durable local
persistence.

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

---

## 3. Goals

1. Provide complete task CRUD with predictable HTTP semantics.
2. Persist tasks across process and machine restarts on the same machine.
3. Support fast retrieval through pagination, free-text search, and status filtering.
4. Record completion time and make completion safe to retry.
5. Keep the operational footprint to Node.js plus one SQLite file.
6. Produce a contract that is easy to test, document, and extend.

---

## 4. Non-goals

The following are explicitly out of scope for v1:

- User accounts, authentication, authorization, or per-user isolation.
- Teams, sharing, assignments, comments, attachments, or subtasks.
- Due dates, reminders, priorities, tags, or recurring tasks.
- Reopening a completed task; completion is one-way.
- Soft delete, archive, restore, or audit history.
- Bulk create/update/delete or import/export.
- CORS support, rate limiting, or public deployment hardening.
- A web or mobile UI, real-time updates, or webhooks.
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
  `POST /api/v1/tasks/:id/complete` need no content type.
- Request bodies are limited to 100 KB.

### 11.2 Endpoints

| Method | Path | Success | Notes |
| --- | --- | --- | --- |
| `POST` | `/api/v1/tasks` | `201` | `Location: /api/v1/tasks/{id}`; returns created task |
| `GET` | `/api/v1/tasks` | `200` | List, search, filter, sort, paginate |
| `GET` | `/api/v1/tasks/:id` | `200` | Returns task |
| `PATCH` | `/api/v1/tasks/:id` | `200` | Partial content update |
| `DELETE` | `/api/v1/tasks/:id` | `204` | No body |
| `POST` | `/api/v1/tasks/:id/complete` | `200` | Idempotent; returns updated task |
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

## 13. Non-functional requirements

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

---

## 14. Acceptance criteria

### Global

- **G1** From a clean clone, install and `npm run verify` pass without a pre-existing database.
- **G2** README commands start the API and demonstrate every endpoint.
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

---

## 15. Traceability

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

---

## 16. Change control

- This specification is approved for v1.
- **v1.1 (2026-11-19):** `POST`/`PATCH` require `application/json` only when the
  request carries a body. Bodyless actions such as task completion no longer
  require a content type. Affects §11.1, §11.10, §11.11, and C7.
- Any change to HTTP behavior, data fields, status semantics, search behavior, or limits
  requires a specification update and re-approval.
- Implementation phases and task ordering may change without altering this contract.
- `ARCHITECTURE.md` may change implementation details as long as this specification’s
  observable behavior is preserved.
