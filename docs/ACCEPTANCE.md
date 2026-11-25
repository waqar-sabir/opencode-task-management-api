# Acceptance Verification

Verification record for `docs/SPEC.md` §15. Date: 2026-11-25.

Covers the v2.0 API (PostgreSQL foundation) and the v1.3 dashboard client.

## Method

| Layer | How |
| --- | --- |
| Automated (API) | `npm run verify` — lint, typecheck, 210 tests |
| Automated (dashboard) | `npm run verify:dashboard` — lint, typecheck, 27 tests |
| HTTP contract | Supertest against `createApp` with a fresh isolated PostgreSQL schema |
| Persistence | Temporary PostgreSQL schemas per test |
| Dashboard behavior | Vitest + Testing Library + jsdom with a mocked `fetch` |
| Manual | `curl` against `node dist/server.js`; `SIGTERM`/restart |
| Manual dashboard | Vite dev server against the API with a temporary database; desktop, dark, mobile, and dialog screenshots |
| Performance | `npm run benchmark` — 10,000 seeded tasks, 300 samples per operation |
| Build | `npm run build`; `npm run build:dashboard` |
| Static | `git ls-files`; source review of startup and logging paths |

## Global

| ID | Result | Evidence |
| --- | --- | --- |
| G1 | Pass | Clean clone: `npm ci`, `npm --prefix dashboard ci`, `npm run verify:all` (151 API + 27 dashboard tests), both builds, `/healthz` `200` — 2026-11-22 |
| G2 | Pass | `README.md` documents setup, run, every endpoint, dashboard features, and error examples |
| G3 | Pass | `tests/unit/middleware/error-handler.test.ts`; every HTTP error asserted as `{ error: { code, message } }` |
| G4 | Pass | Unknown create/update fields and unknown query parameters return `400` (`tasks.test.ts`) |
| G5 | Pass | `row-mapper.test.ts`; timestamp regex assertions in `tasks.test.ts`; live responses |
| G6 | Pass | `git ls-files` contains no `.env`, `data/`, database, WAL/SHM, build, coverage, or dashboard build files |
| G7 | Pass | Default `HOST=127.0.0.1` (`config.test.ts`); live `HOST=0.0.0.0` start logged the no-auth warning |
| G8 | Pass | Request ID, method, path, status, duration logged; title/description/`q` redaction tests in `tasks.test.ts` |
| G9 | Pass | No credential handling exists; all HTTP and live requests succeed without headers |
| G10 | Pass | `shutdown.test.ts`; live `SIGTERM` exited `0` after `shutdown complete`, and a restart read the persisted task |
| G11 | Pass | PostgreSQL connection, shutdown, and capacity failures map to `503 STORAGE_UNAVAILABLE` (`error-handler.test.ts`) |
| G12 | Pass | Unexpected errors return `500 INTERNAL_ERROR` without stack traces or SQL text (`error-handler.test.ts`) |
| G13 | Pass | Connection pool configuration validated; no file permissions (PostgreSQL manages storage) |
| G14 | Pass | `npm run verify:dashboard` and `npm run build:dashboard` pass; `git diff`/route review confirms no API route, schema, header, or CORS change |
| G15 | Pass | `client.test.ts` and `App.test.tsx` use only documented endpoints; `ApiErrorNotice` renders the standard envelope, including validation details |

## Create

| ID | Result | Evidence |
| --- | --- | --- |
| C1 | Pass | "creates a task with defaults and a Location header" |
| C2 | Pass | Same test asserts `status=todo`, `completedAt=null`, equal timestamps |
| C3 | Pass | Whitespace-only, 200-code-point, and 201-code-point title tests |
| C4 | Pass | Missing description defaults; 2000 accepted; 2001 rejected |
| C5 | Pass | Parameterized rejection of `id`, `status`, `createdAt`, `updatedAt`, `completedAt` |
| C6 | Pass | "accepts duplicate titles" |
| C7 | Pass | Malformed JSON `400`, non-JSON `415`, body over 100 KB `413` |
| C8 | Pass | "makes the task immediately retrievable and listable" |

## List

| ID | Result | Evidence |
| --- | --- | --- |
| L1 | Pass | Default page envelope and newest-first ordering tests |
| L2 | Pass | Empty list asserted throughout; repository list tests |
| L3 | Pass | "paginates while reporting the filtered total" |
| L4 | Pass | Invalid `page`/`limit` values return `400` |
| L5 | Pass | Parameterized invalid `sort`/`order` tests |
| L6 | Pass | Repository "tie-breaks equal sort values by id"; repeated-request stability |
| L7 | Pass | "includes completed tasks by default" |
| L8 | Pass | "returns an empty page past the end" |
| L9 | Pass | "accepts the maximum limit"; `limit=101` rejected |

## Detail

| ID | Result | Evidence |
| --- | --- | --- |
| D1 | Pass | Create-then-detail assertions |
| D2 | Pass | "returns a malformed UUID as a validation error" |
| D3 | Pass | "returns 404 for an unknown UUID" |

## Update

| ID | Result | Evidence |
| --- | --- | --- |
| U1 | Pass | "updates only the supplied content fields" |
| U2 | Pass | "keeps id and createdAt and never moves updatedAt backwards" |
| U3 | Pass | "requires at least one content field" |
| U4 | Pass | Parameterized rejection of `status`, `id`, and timestamps |
| U5 | Pass | "applies the create limits to title and description" |
| U6 | Pass | "edits a completed task without reopening it" |
| U7 | Pass | "returns 404 for an unknown id and 400 for a malformed one" |
| U8 | Pass | "makes edited content searchable" |

## Delete

| ID | Result | Evidence |
| --- | --- | --- |
| X1 | Pass | "returns 204 with no body" |
| X2 | Pass | "removes the task from detail, list, search, and filter" |
| X3 | Pass | "returns 404 when deleting twice" |
| X4 | Pass | "deletes completed tasks" |

## Complete

| ID | Result | Evidence |
| --- | --- | --- |
| M1 | Pass | "completes a todo task" |
| M2 | Pass | "is idempotent and preserves the original timestamps" |
| M3 | Pass | Unknown `404` and malformed `400` in the completion describe block |
| M4 | Pass | "does not affect other tasks" |
| M5 | Pass | "keeps completed tasks visible by default and under the filter" |

## Search

| ID | Result | Evidence |
| --- | --- | --- |
| S1 | Pass | "searches titles and descriptions" |
| S2 | Pass | Same test covers descriptions |
| S3 | Pass | "matches non-ASCII case pairs" (`CAFÉ`/`café`) |
| S4 | Pass | Substring fixtures throughout |
| S5 | Pass | "treats LIKE metacharacters literally" |
| S6 | Pass | "returns an empty list when nothing matches" |
| S7 | Pass | Parameterized empty/whitespace `q` cases |
| S8 | Pass | "rejects a q over 200 code points" |
| S9 | Pass | "paginates the combined search and filter result" |
| S10 | Pass | "finds completed tasks by default" |

## Filter

| ID | Result | Evidence |
| --- | --- | --- |
| F1 | Pass | "filters by status" (`todo`) |
| F2 | Pass | "filters by status" (`completed`) |
| F3 | Pass | Invalid status and repeated-status cases return `400` |
| F4 | Pass | "combines search and status with AND" and filtered-total test |

## Persistence

| ID | Result | Evidence |
| --- | --- | --- |
| P1 | Pass | `db:up` starts PostgreSQL 17 and creates development and test databases |
| P2 | Pass | "keeps tasks across a pool close/reopen cycle"; "keeps completion and deletion across a reopen" |
| P3 | Pass | "migrates a fresh schema to version 1" |
| P4 | Pass | "is idempotent when run twice"; "persists the schema version in schema_migrations" |
| P5 | Pass | "refuses a database newer than the code" |
| P6 | Pass | "configures advisory lock and transactional migrations" |
| P7 | Pass | Suite uses isolated PostgreSQL schemas; "no test touches the development database" |
| P8 | Pass | `.gitignore` covers `.env`, `pgdata/`, `dist/`, `coverage/`; confirmed with `git ls-files` |
| P9 | Pass | "recreates an empty migrated schema after the database is dropped" |

## Health

| ID | Result | Evidence |
| --- | --- | --- |
| H1 | Pass | "reports ok when storage responds" |
| H2 | Pass | "returns 503 when the storage probe fails" |

## Dashboard

Manual verification used the Vite dev server on `http://127.0.0.1:5173` proxying to the
API on `http://127.0.0.1:3100` with a temporary PostgreSQL database. Automated evidence is in
`dashboard/src/**/*.test.ts(x)`.

| ID | Result | Evidence |
| --- | --- | --- |
| UI1 | Pass | `App.test.tsx` loads a page and health state; manual header showed “API online” |
| UI2 | Pass | Create modal test and manual create; new task appeared and counts changed |
| UI3 | Pass | Debounced search test; manual title and description searches; no-match empty state |
| UI4 | Pass | Filter tests; summary cards use unfiltered `limit=1` counts and stayed consistent |
| UI5 | Pass | Sort and pagination tests; manual page-size, sort, and order changes requested documented parameters |
| UI6 | Pass | Edit test asserts only changed fields; completed task stayed completed |
| UI7 | Pass | Complete test; row updated in place, complete action removed, no reopen control |
| UI8 | Pass | Delete confirmation test; cancel kept the task, confirm removed it |
| UI9 | Pass | Error-envelope test; code, message, validation details, and retry rendered |
| UI10 | Pass | Distinct loading skeleton, refresh, empty-database, and no-match states |
| UI11 | Pass | Focus trap, Escape, focus restoration, and accessible-name tests |
| UI12 | Pass | 360 px, dark scheme, and reduced-motion screenshots/checks; no overflow |
| UI13 | Pass | Client stores no task content in storage, cookies, or the URL; API response headers contain no CORS |

Screenshots: `docs/dashboard.png` (desktop) and the temporary Playwright captures used
during verification (light, dark, mobile, modal, search, pagination, delete).

## Performance (NFR-1, NFR-9)

`npm run benchmark`, 10,000 tasks, 300 samples per operation:

| Operation | p50 | p95 | Budget | Result |
| --- | --- | --- | --- | --- |
| `GET /tasks/:id` | 2.6 ms | 3.3 ms | 100 ms | Pass |
| `GET /tasks` | 2.7 ms | 3.3 ms | 200 ms | Pass |
| `GET /tasks?page=400` | 3.1 ms | 3.7 ms | 200 ms | Pass |
| `GET /tasks?q=09999` | 11.4 ms | 13.3 ms | 200 ms | Pass |
| `GET /tasks?status=todo` | 3.3 ms | 3.8 ms | 200 ms | Pass |
| `POST /tasks` | 3.3 ms | 3.9 ms | 100 ms | Pass |
| `PATCH /tasks/:id` | 3.1 ms | 3.7 ms | 100 ms | Pass |
| `POST /tasks/:id/complete` | 2.7 ms | 3.3 ms | 100 ms | Pass |
| `DELETE /tasks/:id` | 2.5 ms | 4.3 ms | 100 ms | Pass |

Seeding 10,000 rows took 264 ms. The seeded database is created in an isolated
PostgreSQL schema and removed afterwards.

## Coverage

`npm run test:coverage` over services, the PostgreSQL repository, and the row mapper:
97.0% statements, 100% branches, 100% functions, 96.9% lines (threshold 85%).

## Notes

- The `/complete` endpoint takes no body and is exempt from the content-type
  requirement (SPEC v1.1).
- No test or benchmark writes to `./data`; runtime permission checks used
  temporary paths.
