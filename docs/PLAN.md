# Task Management API — Implementation Plan

**Status:** Approved v2.0 — PostgreSQL foundation; integration layer planned  
**Date:** 2026-11-25 (v1.1: 2026-11-19; v1.2: 2026-11-19; v1.3: 2026-11-22; v2.0: 2026-11-25)  
**Scope:** Single-user local HTTP API with a companion web dashboard, PostgreSQL storage, and a planned provider integration layer  
**Related documents:** [`SPEC.md`](./SPEC.md), [`ARCHITECTURE.md`](./ARCHITECTURE.md), [`ACCEPTANCE.md`](./ACCEPTANCE.md)

---

## 1. Current state

| Item | State |
| --- | --- |
| Business and functional specification | Approved (`SPEC.md`) |
| Technical architecture | Approved (`ARCHITECTURE.md`) |
| Implementation plan | Approved (this document) |
| Phase 0 — scaffold and tooling | **Complete** |
| Phases 1–5 | **Complete** |
| Phase 6 — dashboard | **Complete** |
| Phase 7 — PostgreSQL foundation | **Complete** |
| Application code | Complete v1 API: task lifecycle, health check, graceful shutdown (PostgreSQL) |
| Dashboard | React 19 + Vite SPA in `dashboard/`: list, create, edit, complete, delete, search, filter, sort, pagination, summary, health |
| `package.json` / lockfile | Present and committed; dashboard has its own lockfile |
| Tests | 210 total: all PostgreSQL isolated schemas |
| Database | PostgreSQL 17 via Docker Compose; isolated schema per test; runtime schema at `DATABASE_URL` |
| Benchmark | 10,000 tasks; CRUD p95 ≤ 100 ms, list/search p95 ≤ 200 ms (PostgreSQL) |
| Acceptance record | `docs/ACCEPTANCE.md` |
| Git repository | Initialized on `main`; `origin` configured |

Phases 0–7 are complete. Each later gate must pass before the next phase begins.

---

## 2. Objective and definition of success

**Objective:** deliver a local, single-user task management API and a companion React dashboard that satisfy `SPEC.md`, run with Node.js and PostgreSQL 17 via Docker Compose, and need no external services for task CRUD. Integration connectors (GitHub, Google Tasks, Slack, Notion, MCP, n8n) are developed as independent modules in later phases.

Success at the final gate:

1. All acceptance criteria in `SPEC.md` §15–§18 pass.
2. `npm ci`, `npm --prefix dashboard ci`, and `npm run verify:all` pass from a clean clone.
3. Core API logic coverage is at least 85%; dashboard `api`/`lib` coverage is at least 80%.
4. The README lets a new reviewer run the API and dashboard and exercise every feature in under 10 minutes.
5. Data survives a restart; database schemas are recreated by migration.
6. No out-of-scope feature, secret, or real customer data is present in the task core.
7. `AGENTS.md` matches the implemented runtime, storage, commands, and dashboard.
8. Integration connector scaffolding is present and follows the contract specified in §18 of `SPEC.md`.

---

## 3. Constraints

- Node.js 24 LTS, npm, TypeScript ESM.
- PostgreSQL 17 via Docker Compose; `pg` connection pool, explicit SQL; no ORM.
- Express 5, Zod, pino, Vitest, Supertest.
- React 19, Vite, Testing Library, jsdom for the dashboard.
- No ORM, no authentication (task core), no CORS, no rate limiting, no background workers.
- One API process and one PostgreSQL writer per schema; the dashboard is a separate static client.
- Default bind address `127.0.0.1`; the dashboard is same-origin through a proxy.
- All behavior follows `SPEC.md`; all structure follows `ARCHITECTURE.md`.
- Do not add features that are not in `SPEC.md`.
- Integration connector logic never imports task services or repositories.

---

## 4. Phase overview

| Phase | Focus | Primary requirements | Gate |
| --- | --- | --- | --- |
| **0** | Scaffold and tooling | Tooling, scripts, conventions | Install, lint, typecheck, test, build |
| **1** | Persistence foundation | FR-9; NFR-2, NFR-3, NFR-10 | Repository, migration, and persistence tests |
| **2** | HTTP read/write core | FR-1, FR-2, FR-3, FR-11 | Create/detail/list integration tests |
| **3** | Lifecycle and discovery | FR-4 to FR-8 | Update/delete/complete/search/filter tests |
| **4** | Hardening and operations | FR-10; NFR-4, NFR-5 | Health, shutdown, error mapping, security tests |
| **5** | Verification and release docs | All | Full acceptance and documentation review |
| **6** | Dashboard client | FR-12; BR-9; NFR-11–13; UI1–UI13 | Dashboard build, lint, typecheck, tests, and manual browser verification |
| **7** | PostgreSQL foundation | D2–D18; BR-6, BR-8, BR-10; NFR-1–10 | All 210 tests pass; `npm run verify:all` green; Docker Compose Postgres 17 |
| **8** | Integration layer | §18 of SPEC.md; connector contract; BR-10, BR-11 | Google Tasks connector green; npm verify:all passes; secrets encrypted at rest |
| **9** | API enhancements and scaling | FR-11–13; NFR-9, NFR-10 | Rate limiting, cursor pagination, priorities, bulk import/export |
| **10** | Enhanced dashboard and UI | FR-12; NFR-11–13; UI4–UI13 | Subtasks, drag-and-drop, keyboard shortcuts, presets, analytics |
| **11** | Operations and deployment | NFR-8–10 | Docker production, health checks, CI/CD, monitoring, deployment docs |
| **12** | Finalization and documentation | All | Acceptance criteria verification, final docs, release candidate |

Phases are sequential. A phase gate may not be waived.

---

## 5. Phase 0 — Scaffold and tooling

**Goal:** create a strict, reproducible TypeScript project with no task behavior yet.

### Tasks

- [x] Initialize `package.json` with `"type": "module"`, name, version, and `engines.node >= 24`.
- [x] Add `.nvmrc` with `24`.
- [x] Add runtime dependencies: `express`, `zod`, `pino`, `pino-http`.
- [x] Add development dependencies: `typescript`, `tsx`, `vitest`, `@vitest/coverage-v8`, `supertest`, `@types/node`, `@types/express`, `@types/supertest`, `eslint`, `@eslint/js`, `typescript-eslint`, `prettier`.
- [x] Do not add a SQLite package; use `pg` for PostgreSQL.
- [x] Add scripts: `dev`, `build`, `start`, `lint`, `format`, `format:check`, `typecheck`, `test`, `test:watch`, `test:coverage`, `verify`.
- [x] Define `verify` as lint → typecheck → test, in that order.
- [x] Add `tsconfig.json`: ESM, `NodeNext`, `strict`, `noUncheckedIndexedAccess`, source maps, no emit.
- [x] Add `tsconfig.build.json`: extends base, emits to `dist/`, excludes tests.
- [x] Add ESLint flat config and Prettier configuration.
- [x] Add Vitest config; tests use Node environment and no network.
- [x] Add `.gitignore`: `node_modules/`, `dist/`, `coverage/`, `.env`, `pgdata/`.
- [x] Add `.env.example` with `NODE_ENV`, `PORT`, `HOST`, `DATABASE_URL`, `DATABASE_SSL`, `DATABASE_POOL_MAX`, `LOG_LEVEL`.
- [x] Add a README skeleton with setup, run, test, and database-reset sections.
- [x] Add one minimal test that proves the harness runs; replace it with real tests in Phase 1.
- [x] Update `AGENTS.md`: Node 24, PostgreSQL persistence, and the real commands and layout from this plan; remove the greenfield "Current state" section.
- [x] Commit `package-lock.json` after `npm install`.

### Gate

- [x] `npm ci` succeeds from a clean checkout.
- [x] `npm run lint` passes.
- [x] `npm run typecheck` passes.
- [x] `npm run test` passes.
- [x] `npm run build` emits `dist/`.
- [x] No application endpoint, database code, or business rule exists yet.

**Demo:** show the scripts, strict configs, and green verification.

---

## 6. Phase 1 — Persistence foundation

**Goal:** implement configuration, PostgreSQL connection, migrations, and the task repository without exposing HTTP.

### Tasks

- [x] Implement `src/config.ts` with Zod-validated environment values and defaults.
- [x] Fail startup on invalid config; warn when `HOST` is not loopback (detection in `config.ts`; the warning is emitted by `server.ts` in Phase 2).
- [x] Implement `src/errors.ts` with stable error codes (`VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `STORAGE_UNAVAILABLE`, `CONNECTOR_ERROR`, `UNAUTHORIZED`, `INTERNAL_ERROR`).
- [x] Define `Task`, `TaskStatus`, `CreateTaskRecord`, `TaskContentPatch`, `TaskListQuery`, and `TaskRepository` in `src/repositories/task-repository.ts`.
- [x] Implement `src/db/connection.ts`:
  - resolve `DATABASE_URL`;
  - create `pg` connection pool with `DATABASE_POOL_MAX` and SSL;
  - close cleanly.
- [x] Implement `src/db/migrations.ts` with migration version 1 from `ARCHITECTURE.md` §7.1.
- [x] Use `schema_migrations` table and `pg_advisory_lock`; apply each migration in a transaction; fail if the database is newer than the code.
- [x] Implement `src/db/row-mapper.ts` with explicit snake_case → camelCase mapping and status validation.
- [x] Implement `src/db/postgres-task-repository.ts`:
  - create with `INSERT ... RETURNING *`;
  - find by ID;
  - list with filters, sort allowlist, count, limit, offset;
  - update with `SELECT pg_advisory_lock` and `search_title`/`search_description` recomputation;
  - delete with row count;
  - idempotent complete with `COALESCE` and `CASE`.
- [x] Implement search normalization and `LIKE ... ESCAPE` handling.
- [x] Unit-test the repository with isolated PostgreSQL schemas:
  - create/find/update/delete/complete;
  - completion idempotency;
  - search by title, description, case, substring, and literal wildcards;
  - pagination and total;
  - sort and tie-break;
  - status filter;
  - database `CHECK` behavior for invalid rows.
- [x] Test migrations:
  - fresh schema reaches `schema_migrations` version 1;
  - rerunning is idempotent;
  - a newer schema version fails startup;
  - schema contains both indexes.
- [x] Test persistence with a temporary PostgreSQL schema: write, close pool, reopen, read.

### Gate

- [x] Repository and migration tests pass.
- [x] A temporary PostgreSQL schema survives pool close/reopen.
- [x] Isolated schema tests do not touch the development database.
- [x] `npm run verify` passes.
- [x] No HTTP route or Express app exists yet.

**Demo:** run repository tests and show `schema_migrations` and a persisted task.

---

## 7. Phase 2 — HTTP read/write core

**Goal:** expose create, detail, and list through Express with validation and error handling.

### Tasks

- [x] Implement `src/schemas/task.ts`:
  - create schema with strict keys;
  - title trim and code-point length;
  - description default and code-point length;
  - UUID param schema.
- [x] Implement `src/schemas/list-tasks.ts`:
  - `q`, `status`, `page`, `limit`, `sort`, `order`;
  - defaults and strict unknown-key rejection;
  - coordinate with Express query parsing for repeated values.
- [x] Implement `src/services/tasks.ts`:
  - `createTask` generates UUID and timestamps;
  - `getTask` and `listTasks`;
  - `NotFound` mapping.
- [x] Implement `src/middleware/error-handler.ts`:
  - standard envelope;
  - Zod, JSON parser, payload, media-type, not-found, PostgreSQL, and unknown mapping.
- [x] Implement `src/middleware/request-logger.ts`:
  - request ID;
  - JSON request log;
  - no body, title, description, or query values.
- [x] Implement `src/app.ts`:
  - `express.json({ limit: "100kb", strict: true })`;
  - content-type guard for writes;
  - routes;
  - 404 handler;
  - error middleware.
- [x] Implement `src/routes/tasks.ts` for:
  - `POST /api/v1/tasks`;
  - `GET /api/v1/tasks/:id`;
  - `GET /api/v1/tasks`.
- [x] Implement `src/server.ts`:
  - config, DB, migrations, repository, app, listen;
  - startup logging.
- [x] Integration-test with Supertest:
  - create success and defaults;
  - title/description validation;
  - unknown fields and client-supplied server fields;
  - malformed JSON, wrong content type, oversized body;
  - detail success, malformed ID, unknown ID;
  - list defaults, empty list, page/limit validation, sort/order validation;
  - sort ordering for `createdAt`, `updatedAt`, and `title`, plus the `id` tie-break;
  - pagination and total;
  - unknown query parameters.

### Gate

- [x] C1–C8, D1–D3, and L1–L9 pass through HTTP.
- [x] Error envelope is consistent.
- [x] No content appears in request logs.
- [x] `npm run verify` passes.

**Demo:** create, retrieve, and list tasks with curl/Supertest.

---

## 8. Phase 3 — Lifecycle and discovery

**Goal:** complete the task lifecycle and discovery features.

### Tasks

- [x] Extend `src/services/tasks.ts` with update, delete, and complete.
- [x] Implement `PATCH /api/v1/tasks/:id`:
  - partial content update;
  - at least one field;
  - reject status, IDs, and timestamps;
  - refresh `updatedAt`.
- [x] Implement `DELETE /api/v1/tasks/:id` with `204`.
- [x] Implement `POST /api/v1/tasks/:id/complete` with idempotent behavior.
- [x] Complete search:
  - title and description;
  - case-insensitive, including non-ASCII case pairs;
  - substring;
  - literal `%`, `_`, `\`;
  - `q` trim, empty handling, and 200-code-point cap.
- [x] Complete search and filter:
  - `status=todo|completed`;
  - repeated status rejected;
  - search + filter `AND`;
  - filter combined with search `total`.
- [x] Integration-test:
  - U1–U8, X1–X4, M1–M5;
  - S1–S10, F1–F4;
  - completed task editing and deletion;
  - search reflecting edited content;
  - idempotent completion preserving timestamps;
  - pagination after filtering.

### Gate

- [x] U1–U8, X1–X4, M1–M5, S1–S10, and F1–F4 pass.
- [x] `npm run verify` passes.

**Demo:** edit, search, filter, complete twice, and delete through HTTP.

---

## 9. Phase 4 — Hardening and operations

**Goal:** close the operational, security, and error-handling gaps.

### Tasks

- [x] Implement `GET /healthz` with a `SELECT 1` check; return `503` on failure.
- [x] Implement graceful shutdown:
  - close the HTTP server;
  - then close the database pool;
  - handle `SIGINT` and `SIGTERM`.
- [x] Complete content-type and body-size handling:
  - `415` for non-JSON writes;
  - `413` for bodies over 100 KB;
  - `400` for malformed JSON.
- [x] Complete PostgreSQL error mapping:
  - connection/shutdown/capacity → `503 STORAGE_UNAVAILABLE`;
  - unexpected → `500 INTERNAL_ERROR`.
- [x] PostgreSQL manages storage permissions; no file-level setup required.
- [x] Add startup failure handling for invalid config, unreadable database, failed migration, and newer schema version.
- [x] Verify logs exclude query strings, titles, descriptions, and bodies.
- [x] Add a 404 handler that uses the standard envelope.
- [x] Test:
  - health success and failure;
  - shutdown leaves a reopenable database;
  - storage-error mapping;
  - body/content-type/JSON errors;
  - log redaction via a captured logger;
  - invalid config fails fast;
  - newer schema version fails startup;
  - PostgreSQL pool configuration validated.

### Gate

- [x] G3, G7–G13, H1–H2, P1–P9, and the error-mapping cases pass.
- [x] Restart after shutdown preserves data.
- [x] No task content appears in logs.
- [x] `npm run verify` passes.

**Demo:** health check, invalid requests, forced storage failure, and clean restart.

---

## 10. Phase 5 — Verification and release documentation

**Goal:** prove the whole contract and make the project reproducible.

### Tasks

- [x] Walk through every acceptance criterion in `SPEC.md` §15 and record the result.
- [x] Run `npm run test:coverage`; core logic ≥ 85%.
- [x] Run a manual benchmark with 10,000 seeded tasks:
  - CRUD p95 ≤ 100 ms;
  - list/search p95 ≤ 200 ms.
- [x] Write the full README:
  - prerequisites and Node version;
  - install, dev, build, start, verify;
  - environment variables;
  - curl examples for every endpoint;
  - search/filter/sort examples;
  - database location, reset, and backup notes;
  - localhost/no-auth security warning.
- [x] Re-verify `AGENTS.md` against the final implementation; correct drift.
- [x] Review `SPEC.md`, `ARCHITECTURE.md`, and `PLAN.md` against the implementation; correct drift.
- [x] Confirm `.gitignore` covers `.env`, `pgdata/`, `dist/`, `coverage/`, `node_modules/`, and dashboard build output.
- [x] Confirm no secrets, real data, or out-of-scope features exist.

### Gate

- [x] All `SPEC.md` acceptance criteria pass.
- [x] `npm ci && npm run verify` passes from a clean clone.
- [x] `npm run build` succeeds and `node dist/server.js` answers `GET /healthz`.
- [x] Coverage target is met.
- [x] README demo completes in under 10 minutes.
- [x] Persistence demo works across a restart.
- [x] `AGENTS.md` and the three documents match the code.
- [x] No out-of-scope feature is present.

**Demo:** the full README flow from a clean clone.

---

## 11. Phase 6 — Dashboard client

**Goal:** deliver a React dashboard that exercises the documented API without changing it, then bring the documentation back in sync.

### Tasks

- [x] Add `dashboard/` as a separate Vite + React 19 + TypeScript SPA with its own `package.json`, lockfile, strict `tsconfig.json`, ESLint config, and Prettier formatting.
- [x] Configure Vite dev and preview servers on fixed ports with a proxy for `/api` and `/healthz`; allow `TASK_API_URL` to change the proxy target.
- [x] Implement a typed API client for list, detail, create, update, complete, delete, counts, and health; parse the standard error envelope into a typed error.
- [x] Build the list view: task rows with title, description, status, updated/completed times, loading skeletons, empty states, and a no-match state.
- [x] Add create and edit modals with client-side limits, changed-field-only updates, focus trapping, Escape handling, and focus restoration.
- [x] Add completion and confirmed deletion with busy states and live-region toasts.
- [x] Add 300 ms debounced search, status filters, sort, order, and page-size controls; reset to page 1 when the query shape changes.
- [x] Add summary cards from three `limit=1` list calls and a health indicator with a manual recheck.
- [x] Add responsive light/dark styling from 360 px upward and respect reduced motion.
- [x] Test the client, formatting, validation, and App behavior with Vitest, Testing Library, and jsdom using a mocked `fetch`; enforce 80% coverage on `api` and `lib`.
- [x] Add root scripts `dev:dashboard`, `build:dashboard`, `test:dashboard`, `verify:dashboard`, and `verify:all`.
- [x] Exclude `dashboard/` from root ESLint and generated dashboard output from git.
- [x] Update `SPEC.md` (v1.3 §13 and dashboard criteria), `ARCHITECTURE.md`, `ACCEPTANCE.md`, `README.md`, `AGENTS.md`, and `dashboard/README.md`.
- [x] Verify manually against a temporary API database: create, search, filter, edit, complete, delete, paginate, sort, dark mode, and a 360 px layout; check the browser console.
- [x] Copy a representative screenshot to `docs/dashboard.png`.

### Gate

- [x] `npm --prefix dashboard ci && npm run verify:dashboard` passes.
- [x] `npm run build:dashboard` emits `dashboard/dist/`.
- [x] `npm run verify:all` passes from a clean clone.
- [x] The dashboard uses only documented endpoints and adds no API route, schema, header, or CORS behavior.
- [x] No task content is written to browser storage or the URL.
- [x] UI1–UI13 and G14–G15 pass and are recorded in `ACCEPTANCE.md`.
- [x] Documentation and `AGENTS.md` match the implementation.

**Demo:** start the API, run `npm run dev:dashboard`, and exercise the full task lifecycle in the browser.

---

## 13. Phase 8 — Integration layer

**Goal:** deliver independent integration connectors (GitHub, Google Tasks, Slack, Notion, MCP, n8n) that communicate through a transactional outbox and never couple provider logic to the task service.

### Tasks

- [ ] Define connector contract in `SPEC.md` §18: validated config/secrets, normalized data output, no task service import
- [ ] Implement Google Tasks connector: OAuth 2.0, task retrieval, cursor-based sync
- [ ] Implement GitHub connector: repository API, issue/label mapping, webhook handling
- [ ] Implement Slack connector: Messages API, channels, reactions, button endpoints
- [ ] Implement Notion connector: Blocks API, database queries, page updates
- [ ] Implement MCP connector: stdio-based protocol, task list/events
- [ ] Implement n8n connector: REST API, workflow triggers, webhook endpoints
- [ ] Implement event dispatcher: Postgres outbox with `FOR UPDATE SKIP LOCKED`, retries, dead-letter queue
- [ ] Add `INTEGRATIONS_SECRET_KEY` to env configuration
- [ ] Update `src/config.ts` with integration config validation
- [ ] Write unit tests for each connector's normalize/de-normalize functions
- [ ] Write integration tests for outbox dispatch and retry logic
- [ ] Document error codes: CONNECTOR_ERROR 502, CONNECTOR_RATE_LIMITED 429

### Gate

- [ ] Google Tasks connector greenfield implementation passes unit tests
- [ ] Outbox dispatch reliability ≥ 99% over 1000 attempts
- [ ] No connector logic imports task services or repositories
- [ ] `npm run verify:all` passes with all connectors stubbed
- [ ] `INTEGRATIONS_SECRET_KEY` validation fails fast on startup

**Demo:** configure `INTEGRATIONS_SECRET_KEY`, run `npm run db:up`, then attempt Google Tasks connector init.

---

## 12. Phase 7 — PostgreSQL foundation

**Goal:** migrate the task API from SQLite to PostgreSQL 17 with isolated schemas per test, then establish the independent integration layer boundary.

### Tasks

- [x] Replace SQLite dependency with `pg` connection pool in `src/db/connection.ts`.
- [x] Rewrite `src/db/migrations.ts` with `schema_migrations` table and `pg_advisory_lock`.
- [x] Rewrite `src/db/postgres-task-repository.ts` with explicit SQL queries.
- [x] Rewrite `src/db/row-mapper.ts` for PostgreSQL `TIMESTAMPTZ` types.
- [x] Update `src/config.ts` with `DATABASE_URL` and `TEST_DATABASE_URL`.
- [x] Rewrite all 13 test files for PostgreSQL isolated schemas.
- [x] Add `scripts/migrate.ts` for pg migration runner.
- [x] Add Docker Compose `db` service on port 5433.
- [x] Add scripts: `db:up`, `db:down`, `db:logs`, `db:migrate`, `db:reset`.
- [x] Update `.env.example` with `DATABASE_URL`/`TEST_DATABASE_URL`.
- [x] Update `SPEC.md` to v2.0: PostgreSQL references, new decisions D2–D18, BR-10/BR-11.
- [x] Update `docs/ARCHITECTURE.md`: replace SQLite references with PostgreSQL.
- [x] Update `docs/PLAN.md`: add Phase 6.5 and integration phases.
- [x] Update `README.md`: PostgreSQL + Docker Compose setup commands.
- [x] Update `AGENTS.md`: PostgreSQL baseline, commands, structure.

### Gate

- [x] `npm run verify:all` passes (210 tests, lint, typecheck).
- [x] Docker Compose `db` service is up on port 5433.
- [x] All schemas are isolated; no test shares DB state.
- [x] `npm run test` passes with PostgreSQL.
- [x] Error codes CONFLICT 409 mapped in middleware.

**Demo:** run `npm run db:up`, then `npm run verify:all`, then `npm run db:down`.

---

## 14. Phase 9 — API enhancements and scaling

**Goal:** add rate limiting, cursor pagination, priorities, due dates, and bulk import/export without changing the task core contract.

### Tasks

- [ ] Add rate-limit middleware with configurable window and limit; exempt `/healthz`.
- [ ] Implement cursor-based pagination as an alternative to offset; add `cursor` and `limit` query parameters.
- [ ] Add `priority` field (low/medium/high) to task model with validation and default.
- [ ] Add `dueAt` optional timestamp field; update search/filter to support due-date queries.
- [ ] Implement bulk create endpoint `POST /api/v1/tasks/bulk` accepting an array.
- [ ] Implement bulk update endpoint `PATCH /api/v1/tasks/bulk` with ID + patch pairs.
- [ ] Implement export endpoint `GET /api/v1/tasks/export` returning NDJSON.
- [ ] Implement import endpoint `POST /api/v1/tasks/import` accepting NDJSON with validation.
- [ ] Update `SPEC.md` with new fields, endpoints, and pagination variant.
- [ ] Update `ARCHITECTURE.md` with new indexes, query patterns, and rate-limit design.
- [ ] Add integration tests for all new endpoints and query parameters.
- [ ] Add benchmark for cursor pagination and bulk operations.

### Gate

- [ ] `npm run verify:all` passes.
- [ ] Rate limiting returns `429` with `Retry-After` on exceedance.
- [ ] Cursor pagination returns stable ordering and works with filters.
- [ ] Bulk endpoints validate all items before any write; partial failure returns details.
- [ ] Export/import round-trip preserves all task fields.

**Demo:** exercise rate limiting, cursor pagination, priorities, due dates, and bulk import/export.

---

## 15. Phase 10 — Enhanced dashboard and UI

**Goal:** deliver subtasks, drag-and-drop reordering, keyboard shortcuts, saved presets, dark mode refinements, and analytics in the dashboard without changing the API contract.

### Tasks

- [ ] Add subtask model to dashboard state (client-side only; not in API v1).
- [ ] Implement drag-and-drop task reordering with `@dnd-kit`; persist order locally.
- [ ] Add global keyboard shortcuts (new task, search, filters, complete, delete).
- [ ] Add saved filter/sort presets with names; persist to `localStorage`.
- [ ] Enhance dark mode with custom color tokens; add manual theme toggle.
- [ ] Add analytics view: completion rate over time, tasks by priority, due-date heatmap.
- [ ] Update `dashboard/README.md` with new features.
- [ ] Add component tests for new UI patterns; maintain 80% coverage.
- [ ] Verify accessibility: keyboard operation, focus management, live regions.
- [ ] Test at 360 px, light/dark, reduced motion; update `docs/dashboard.png`.

### Gate

- [ ] `npm run verify:all` passes.
- [ ] New features work entirely through documented API; no new endpoints required.
- [ ] Keyboard shortcuts discoverable and conflict-free.
- [ ] Drag-and-drop does not affect API order (client-side only).
- [ ] Analytics derive from API data only; no server-side aggregation.

**Demo:** run dashboard, exercise subtasks, drag-and-drop, shortcuts, presets, analytics.

---

## 16. Phase 11 — Operations and deployment

**Goal:** production-ready Docker image, health checks, CI/CD pipeline, monitoring, and deployment documentation.

### Tasks

- [ ] Create multi-stage `Dockerfile` for API: build → runtime with non-root user.
- [ ] Create `docker-compose.prod.yml` with PostgreSQL, API, and reverse proxy (nginx/Traefik).
- [ ] Add production health checks: `/healthz` liveness, `/ready` readiness (migrations done).
- [ ] Configure structured JSON logging with `LOG_LEVEL`; add log rotation.
- [ ] Set up GitHub Actions CI/CD: lint, typecheck, test, build, container scan, deploy.
- [ ] Add Prometheus metrics endpoint `/metrics` (request count, latency, errors, pool stats).
- [ ] Configure Grafana dashboard for API and PostgreSQL metrics.
- [ ] Document backup/restore with `pg_dump`/`pg_restore` and volume snapshots.
- [ ] Document rolling update procedure and rollback.
- [ ] Write `docs/DEPLOYMENT.md` with production runbook.

### Gate

- [ ] `docker compose -f docker-compose.prod.yml up` starts healthy stack.
- [ ] `/healthz` and `/ready` distinguish liveness vs. readiness.
- [ ] CI/CD pipeline passes on `main`; container image published to GHCR.
- [ ] Metrics scrape and Grafana dashboard renders.
- [ ] Backup/restore verified on a test database.

**Demo:** build image, run prod compose, hit health checks, view Grafana.

---

## 17. Phase 12 — Finalization and documentation

**Goal:** verify all acceptance criteria, finalize documentation, cut release candidate, and clean repository.

### Tasks

- [ ] Walk through every `SPEC.md` acceptance criterion (§15) and record in `ACCEPTANCE.md`.
- [ ] Run `npm run test:coverage`; confirm core logic ≥ 85%, dashboard ≥ 80%.
- [ ] Run full benchmark with 10,000 tasks; confirm p95 budgets.
- [ ] Finalize `README.md`, `SPEC.md`, `ARCHITECTURE.md`, `PLAN.md`, `ACCEPTANCE.md`, `dashboard/README.md`.
- [ ] Update `AGENTS.md` to match final runtime, commands, and structure.
- [ ] Confirm `.gitignore` covers all generated/secret files.
- [ ] Remove any debug code, temporary scripts, or out-of-scope features.
- [ ] Tag `v2.0.0` release candidate; create GitHub release with changelog.
- [ ] Archive completed phase branches; ensure `main` is clean.

### Gate

- [ ] All `SPEC.md` acceptance criteria pass.
- [ ] `npm ci && npm --prefix dashboard ci && npm run verify:all` passes from clean clone.
- [ ] `npm run build` and `npm run build:dashboard` succeed; artifacts load.
- [ ] Coverage targets met; benchmark budgets met.
- [ ] No secrets, database files, or generated output tracked.
- [ ] All five docs + `AGENTS.md` + `README.md` agree with implementation.
- [ ] Release candidate tagged and published.

**Demo:** the full README flow from a clean clone; show release artifacts.

---

## 18. Test plan

### 18.1 Automated

| Area | Location | What it proves |
| --- | --- | --- |
| Config | `tests/unit/config.test.ts` | Defaults, coercion, fail-fast validation, loopback detection |
| Schemas | `tests/integration/tasks.test.ts` | Strict keys, defaults, trimming, code-point limits, query rules |
| Services | `tests/integration/tasks.test.ts` | ID/timestamp generation, not-found translation, patch merging |
| Repository | `tests/unit/db/task-repository.test.ts` | SQL, search, filtering, sorting, pagination, idempotency |
| Migrations | `tests/unit/db/migrations.test.ts` | `schema_migrations`, idempotency, newer-version failure |
| Row mapper | `tests/unit/db/row-mapper.test.ts` | Snake_case mapping, status validation, null completion |
| Connection | `tests/unit/db/connection.test.ts` | Pool config, SSL, advisory lock, idempotent close |
| Error mapping | `tests/unit/middleware/error-handler.test.ts` | 400/404/413/415/500/503 behavior |
| HTTP integration | `tests/integration/tasks.test.ts` | Full request/response contract |
| Persistence | `tests/integration/persistence.test.ts` | Close/reopen durability, delete-and-recreate |
| Health | `tests/integration/health.test.ts` | 200/503 and unversioned mount |
| Shutdown | `tests/integration/shutdown.test.ts` | Drain, database close, reopenable file, idempotent stop |
| Dashboard client | `dashboard/src/api/client.test.ts` | Query building, error envelope, network failure, counts, health |
| Dashboard lib | `dashboard/src/lib/*.test.ts` | Date/plural/percentage formatting and form validation |
| Dashboard App | `dashboard/src/App.test.tsx` | Loading, empty, error, search debounce, filters, sort, pagination, CRUD, dialogs, focus, toasts |

### 18.2 Commands

```bash
npm run test
npm run test:watch
npm run test:coverage
npm run verify
npm run benchmark
npx vitest run tests/integration/tasks.test.ts -t "creates a task"
npx vitest run tests/integration/tasks.test.ts
npm run test:dashboard
npm run verify:dashboard
npm run verify:all
npm --prefix dashboard run test -- src/App.test.tsx
```

### 18.3 Manual verification

1. Start from a clean checkout: `npm ci && npm run dev`.
2. `GET /healthz` returns `200`.
3. Create a task; confirm `201`, `Location`, `status=todo`.
4. List it; confirm defaults and pagination.
5. Retrieve it by ID.
6. Edit title and description; confirm `updatedAt` changes or stays equal within the same millisecond, and `createdAt` does not.
7. Search by a title fragment and a description fragment.
8. Filter by both statuses and combine with search.
9. Complete the task; repeat completion; confirm the original `completedAt` is kept.
10. Delete it; confirm `204`, then `404`.
11. Restart the process; confirm remaining tasks persist.
12. Send invalid UUID, unknown ID, bad status, bad sort, oversized body, and wrong content type; confirm the documented codes.
13. Inspect logs; confirm no titles, descriptions, or query values.
14. Run the 10,000-task benchmark.
15. In a second terminal, `npm --prefix dashboard ci && npm run dev:dashboard`.
16. Open `http://127.0.0.1:5173`; confirm the health indicator is online and tasks load.
17. Create a task with a title and description; confirm it appears and the summary counts update.
18. Search by a title fragment and a description fragment; confirm the 300 ms debounce and the no-match state.
19. Switch status filters, sort fields, order, and page size; confirm page resets to 1.
20. Edit a task; confirm only changed content is sent and completion is preserved.
21. Complete a task; confirm the complete action disappears and there is no reopen.
22. Delete a task; confirm the confirmation dialog, cancellation, and removal.
23. Check keyboard operation: skip link, dialog focus trap, Escape, and focus restoration.
24. Check 360 px layout, light and dark schemes, and reduced motion.
25. Confirm the browser console is clean and no task content appears in storage or the URL.

---

## 15. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Node 24 unavailable on a contributor machine | Medium | Setup failure | `.nvmrc`, `engines`, README prerequisite |
| `pg` driver behavior changes | Low | Repository breakage | Pin Node major; direct repository tests; fallback driver |
| PostgreSQL connection pool exhaustion | Low at target | Latency | Pool sizing, limit cap, 10k benchmark |
| Search scan slows with growth | Medium | Slow search | Accept at 10k; FTS5 deferred |
| Timestamp collision in tests | Medium | Flaky assertions | Use `>=`; fake timers |
| Test schema leakage | Medium | Flaky tests | Fresh isolated schema per test; inject repository |
| Migration error | Low | Startup failure | Transactional migrations; version check; tests |
| No-auth exposure | Medium if misconfigured | Full data access | Loopback default; warning; README security note |
| Unescaped search wildcards | Medium | Wrong results | Escape function plus literal-wildcard tests |
| Body/content-type edge cases | Medium | Wrong status codes | Explicit middleware and integration tests |
| Dashboard/API contract drift | Medium | Broken UI or accidental API change | Typed client mirrors the spec; API tests unchanged; G14–G15 |
| Missing production proxy | Medium | Dashboard cannot reach the API | Document same-origin requirement; Vite proxy in dev/preview |
| Browser storage leaks task content | Low | Privacy loss on shared machines | No storage or URL persistence; UI13 test |
| Debounced search race | Medium | Stale results overwrite fresh ones | `AbortController` per request; debounce tests |
| Scope creep | Medium | Delayed release | `SPEC.md` change control; phase gates |

---

## 16. Definition of done

- [x] All acceptance criteria in `SPEC.md` §15 are verified.
- [x] `npm ci && npm --prefix dashboard ci && npm run verify:all` passes from a clean clone.
- [x] `npm run build` succeeds and `node dist/server.js` answers `GET /healthz`.
- [x] `npm run build:dashboard` emits a static bundle that loads with the API running.
- [x] `npm run test:coverage` meets the 85% API target; dashboard coverage meets 80%.
- [x] Every endpoint and dashboard feature is demonstrated in the README.
- [x] Persistence works across restart.
- [x] Health, graceful shutdown, and error mapping work.
- [x] Logs contain no task content or search terms.
- [x] The dashboard adds no API route, schema, header, or CORS behavior.
- [x] No secrets, database files, or generated output are tracked.
- [x] `AGENTS.md`, `SPEC.md`, `ARCHITECTURE.md`, `PLAN.md`, and the README agree.
- [x] No out-of-scope feature is present.

---

## 17. Out of scope

- Accounts, authentication, authorization, and per-user isolation.
- Teams, sharing, assignments, comments, attachments, subtasks.
- Due dates, reminders, priorities, tags, recurring tasks.
- Reopen, soft delete, archive, restore, audit history.
- Bulk operations, import/export.
- CORS, rate limiting, public deployment hardening.
- Real-time updates, webhooks, offline mode, and a native mobile client.
- Cross-origin dashboard deployment; v1.3 is same-origin only.
- Ranked/full-text search and accent-insensitive search.
- Cursor pagination, ETag/version concurrency.
- OpenAPI generation, Docker, hosted infrastructure, backup tooling.

---

## 18. Change control

- The approved scope is defined by `SPEC.md`; changes to observable behavior require a specification update and re-approval.
- Phase order may change if a dependency requires it, but no gate is skipped.
- `ARCHITECTURE.md` may change implementation details without re-approval as long as `SPEC.md` behavior is preserved.
- Any new dependency or runtime change must be recorded in `ARCHITECTURE.md`.
- Documentation is updated in the same phase that changes behavior.
- **v1.1 (2026-11-22):** adds Phase 6 (dashboard client), dashboard commands, tests, and documentation. No API behavior or phase gate changes.