# Task Management API — Implementation Plan

**Status:** Approved v1.0 — documentation only; no application code exists
**Date:** 2026-11-18
**Scope:** Single-user local HTTP API
**Related documents:** [`SPEC.md`](./SPEC.md), [`ARCHITECTURE.md`](./ARCHITECTURE.md)

---

## 1. Current state

| Item | State |
| --- | --- |
| Business and functional specification | Approved (`SPEC.md`) |
| Technical architecture | Approved (`ARCHITECTURE.md`) |
| Implementation plan | Approved (this document) |
| Phase 0 — scaffold and tooling | **Complete** |
| Application code | Persistence layer + create/detail/list HTTP API |
| `package.json` / lockfile | Present and committed |
| Tests | 100 tests: unit (config, repository, migrations, mapper) and HTTP integration |
| Database | Schema v1; runtime file at `DATABASE_PATH` |
| Git repository | Initialized on `main`; `origin` configured |

Phase 0 is complete. Each later gate must pass before the next phase begins.

---

## 2. Objective and definition of success

**Objective:** deliver a local, single-user task management API that satisfies `SPEC.md`
and runs with Node.js and one SQLite file, with no external services.

Success at the final gate:

1. All acceptance criteria in `SPEC.md` §14 pass.
2. `npm ci` and `npm run verify` pass from a clean clone.
3. Core logic coverage is at least 85%.
4. The README lets a new reviewer run the API and exercise every endpoint in under
   10 minutes.
5. Data survives a restart; WAL and database files are not tracked.
6. No out-of-scope feature, secret, or real customer data is present.
7. `AGENTS.md` matches the implemented runtime, storage, and commands.

---

## 3. Constraints

- Node.js 24 LTS, npm, TypeScript ESM.
- Built-in `node:sqlite`; no native database add-on.
- Express 5, Zod, pino, Vitest, Supertest.
- No ORM, no authentication, no CORS, no rate limiting, no background workers.
- One process and one SQLite writer.
- Default bind address `127.0.0.1`.
- All behavior follows `SPEC.md`; all structure follows `ARCHITECTURE.md`.
- Do not add features that are not in `SPEC.md`.

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

Phases are sequential. A phase gate may not be waived.

---

## 5. Phase 0 — Scaffold and tooling

**Goal:** create a strict, reproducible TypeScript project with no task behavior yet.

### Tasks

- [x] Initialize `package.json` with `"type": "module"`, name, version, and
      `engines.node >= 24`.
- [x] Add `.nvmrc` with `24`.
- [x] Add runtime dependencies: `express`, `zod`, `pino`, `pino-http`.
- [x] Add development dependencies: `typescript`, `tsx`, `vitest`, `@vitest/coverage-v8`,
      `supertest`, `@types/node`, `@types/express`, `@types/supertest`, `eslint`,
      `@eslint/js`, `typescript-eslint`, `prettier`.
- [x] Do not add a SQLite package; use `node:sqlite`.
- [x] Add scripts:
      `dev`, `build`, `start`, `lint`, `format`, `format:check`, `typecheck`, `test`,
      `test:watch`, `test:coverage`, `verify`.
- [x] Define `verify` as lint → typecheck → test, in that order.
- [x] Add `tsconfig.json`: ESM, `NodeNext`, `strict`, `noUncheckedIndexedAccess`,
      source maps, no emit.
- [x] Add `tsconfig.build.json`: extends base, emits to `dist/`, excludes tests.
- [x] Add ESLint flat config and Prettier configuration.
- [x] Add Vitest config; tests use Node environment and no network.
- [x] Add `.gitignore`: `node_modules/`, `dist/`, `coverage/`, `data/`, `*.db`,
      `*.db-wal`, `*.db-shm`, `.env`.
- [x] Add `.env.example` with `NODE_ENV`, `PORT`, `HOST`, `DATABASE_PATH`, `LOG_LEVEL`.
- [x] Add a README skeleton with setup, run, test, and database-reset sections.
- [x] Add one minimal test that proves the harness runs; replace it with real tests in
      Phase 1.
- [x] Update `AGENTS.md`: Node 24, `node:sqlite` persistence, and the real commands and
      layout from this plan; remove the greenfield "Current state" section.
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

**Goal:** implement configuration, SQLite connection, migrations, and the task repository
without exposing HTTP.

### Tasks

- [x] Implement `src/config.ts` with Zod-validated environment values and defaults.
- [x] Fail startup on invalid config; warn when `HOST` is not loopback
      (detection in `config.ts`; the warning is emitted by `server.ts` in Phase 2).
- [x] Implement `src/errors.ts` with stable error codes (`VALIDATION_ERROR`,
      `NOT_FOUND`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`,
      `STORAGE_UNAVAILABLE`, `INTERNAL_ERROR`).
- [x] Define `Task`, `TaskStatus`, `CreateTaskRecord`, `TaskContentPatch`,
      `TaskListQuery`, and `TaskRepository` in `src/repositories/task-repository.ts`.
- [x] Implement `src/db/connection.ts`:
      - resolve `DATABASE_PATH`;
      - create parent directories with mode `0700`;
      - open `DatabaseSync`;
      - set WAL, `synchronous=FULL`, `foreign_keys=ON`, `busy_timeout=5000`;
      - set file mode `0600` on POSIX;
      - close cleanly.
- [x] Implement `src/db/migrations.ts` with migration version 1 from
      `ARCHITECTURE.md` §7.1.
- [x] Use `PRAGMA user_version`; apply each migration in `BEGIN IMMEDIATE`; fail if the
      database is newer than the code.
- [x] Implement `src/db/row-mapper.ts` with explicit snake_case → camelCase mapping and
      status validation.
- [x] Implement `src/db/sqlite-task-repository.ts`:
      - create with `INSERT ... RETURNING *`;
      - find by ID;
      - list with filters, sort allowlist, count, limit, offset;
      - update with `BEGIN IMMEDIATE` and `search_text` recomputation;
      - delete with `changes`;
      - idempotent complete with `COALESCE` and `CASE`.
- [x] Implement search normalization and `LIKE ... ESCAPE` handling.
- [x] Unit-test the repository with `:memory:`:
      - create/find/update/delete/complete;
      - completion idempotency;
      - search by title, description, case, substring, and literal wildcards;
      - pagination and total;
      - sort and tie-break;
      - status filter;
      - database `CHECK` behavior for invalid rows.
- [x] Test migrations:
      - fresh database reaches `user_version=1`;
      - rerunning is idempotent;
      - a newer `user_version` fails startup;
      - schema contains both indexes.
- [x] Test persistence with a temporary file database: write, close, reopen, read.

### Gate

- [x] Repository and migration tests pass.
- [x] A temporary file database survives close/reopen.
- [x] `:memory:` tests do not touch `./data`.
- [x] `npm run verify` passes.
- [x] No HTTP route or Express app exists yet.

**Demo:** run repository tests and show `user_version` and a persisted task.

---

## 7. Phase 2 — HTTP read/write core

**Goal:** expose create, detail, and list through Express with validation and error
handling.

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
      - Zod, JSON parser, payload, media-type, not-found, SQLite, and unknown mapping.
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

- [ ] Extend `src/services/tasks.ts` with update, delete, and complete.
- [ ] Implement `PATCH /api/v1/tasks/:id`:
      - partial content update;
      - at least one field;
      - reject status, IDs, and timestamps;
      - refresh `updatedAt`.
- [ ] Implement `DELETE /api/v1/tasks/:id` with `204`.
- [ ] Implement `POST /api/v1/tasks/:id/complete` with idempotent behavior.
- [ ] Complete search:
      - title and description;
      - case-insensitive, including non-ASCII case pairs;
      - substring;
      - literal `%`, `_`, `\`;
      - `q` trim, empty handling, and 200-code-point cap.
- [ ] Complete search and filter:
      - `status=todo|completed`;
      - repeated status rejected;
      - search + filter `AND`;
      - filter combined with search `total`.
- [ ] Integration-test:
      - U1–U8, X1–X4, M1–M5;
      - S1–S10, F1–F4;
      - completed task editing and deletion;
      - search reflecting edited content;
      - idempotent completion preserving timestamps;
      - pagination after filtering.

### Gate

- [ ] U1–U8, X1–X4, M1–M5, S1–S10, and F1–F4 pass.
- [ ] `npm run verify` passes.

**Demo:** edit, search, filter, complete twice, and delete through HTTP.

---

## 9. Phase 4 — Hardening and operations

**Goal:** close the operational, security, and error-handling gaps.

### Tasks

- [ ] Implement `GET /healthz` with a `SELECT 1` check; return `503` on failure.
- [ ] Implement graceful shutdown:
      - close the HTTP server;
      - then close the database;
      - handle `SIGINT` and `SIGTERM`.
- [ ] Complete content-type and body-size handling:
      - `415` for non-JSON writes;
      - `413` for bodies over 100 KB;
      - `400` for malformed JSON.
- [ ] Complete SQLite error mapping:
      - busy/locked → `503 STORAGE_UNAVAILABLE`;
      - unexpected → `500 INTERNAL_ERROR`.
- [ ] Enforce POSIX permissions for the data directory and database file.
- [ ] Add startup failure handling for invalid config, unreadable database, failed
      migration, and newer schema version.
- [ ] Verify logs exclude query strings, titles, descriptions, and bodies.
- [ ] Add a 404 handler that uses the standard envelope.
- [ ] Test:
      - health success and failure;
      - shutdown leaves a reopenable database;
      - storage-error mapping;
      - body/content-type/JSON errors;
      - log redaction via a captured logger;
      - invalid config fails fast;
      - newer schema version fails startup;
      - data-directory creation and file permissions on POSIX.

### Gate

- [ ] G3, G7–G13, H1–H2, P1–P9, and the error-mapping cases pass.
- [ ] Restart after shutdown preserves data.
- [ ] No task content appears in logs.
- [ ] `npm run verify` passes.

**Demo:** health check, invalid requests, forced storage failure, and clean restart.

---

## 10. Phase 5 — Verification and release documentation

**Goal:** prove the whole contract and make the project reproducible.

### Tasks

- [ ] Walk through every acceptance criterion in `SPEC.md` §14 and record the result.
- [ ] Run `npm run test:coverage`; core logic ≥ 85%.
- [ ] Run a manual benchmark with 10,000 seeded tasks:
      - CRUD p95 ≤ 100 ms;
      - list/search p95 ≤ 200 ms.
- [ ] Write the full README:
      - prerequisites and Node version;
      - install, dev, build, start, verify;
      - environment variables;
      - curl examples for every endpoint;
      - search/filter/sort examples;
      - database location, reset, and backup notes;
      - localhost/no-auth security warning.
- [ ] Re-verify `AGENTS.md` against the final implementation; correct drift.
- [ ] Review `SPEC.md`, `ARCHITECTURE.md`, and `PLAN.md` against the implementation;
      correct drift.
- [ ] Confirm `.gitignore` covers `data/`, database files, WAL/SHM files, `.env`,
      `node_modules/`, `dist/`, and `coverage/`.
- [ ] Confirm no secrets, real data, or out-of-scope features exist.

### Gate

- [ ] All `SPEC.md` acceptance criteria pass.
- [ ] `npm ci && npm run verify` passes from a clean clone.
- [ ] `npm run build` succeeds and `node dist/server.js` answers `GET /healthz`.
- [ ] Coverage target is met.
- [ ] README demo completes in under 10 minutes.
- [ ] Persistence demo works across a restart.
- [ ] `AGENTS.md` and the three documents match the code.
- [ ] No out-of-scope feature is present.

**Demo:** the full README flow from a clean clone.

---

## 11. Test plan

### 11.1 Automated

| Area | Location | What it proves |
| --- | --- | --- |
| Schemas | `tests/unit/schemas/` | Strict keys, defaults, trimming, code-point limits, query rules |
| Services | `tests/unit/services/` | ID/timestamp generation, not-found translation, patch merging |
| Repository | `tests/unit/db/task-repository.test.ts` | SQL, search, filtering, sorting, pagination, idempotency |
| Migrations | `tests/unit/db/migrations.test.ts` | `user_version`, idempotency, newer-version failure |
| Row mapper | `tests/unit/db/row-mapper.test.ts` | Snake_case mapping, status validation, null completion |
| Error mapping | `tests/unit/middleware/error-handler.test.ts` | 400/404/413/415/500/503 behavior |
| HTTP integration | `tests/integration/tasks.test.ts` | Full request/response contract |
| Persistence | `tests/integration/persistence.test.ts` | Close/reopen durability |
| Health/shutdown | `tests/integration/health.test.ts` | 200/503 and clean close |

### 11.2 Commands

```bash
npm run test
npm run test:watch
npm run test:coverage
npm run verify
npx vitest run tests/integration/tasks.test.ts -t "creates a task"
npx vitest run tests/integration/tasks.test.ts
```

### 11.3 Manual verification

1. Start from a clean checkout: `npm ci && npm run dev`.
2. `GET /healthz` returns `200`.
3. Create a task; confirm `201`, `Location`, `status=todo`.
4. List it; confirm defaults and pagination.
5. Retrieve it by ID.
6. Edit title and description; confirm `updatedAt` changes or stays equal within the
   same millisecond, and `createdAt` does not.
7. Search by a title fragment and a description fragment.
8. Filter by both statuses and combine with search.
9. Complete the task; repeat completion; confirm the original `completedAt` is kept.
10. Delete it; confirm `204`, then `404`.
11. Restart the process; confirm remaining tasks persist.
12. Send invalid UUID, unknown ID, bad status, bad sort, oversized body, and wrong
    content type; confirm the documented codes.
13. Inspect logs; confirm no titles, descriptions, or query values.
14. Run the 10,000-task benchmark.

---

## 12. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Node 24 unavailable on a contributor machine | Medium | Setup failure | `.nvmrc`, `engines`, README prerequisite |
| `node:sqlite` behavior changes | Low | Repository breakage | Pin Node major; direct repository tests; fallback driver |
| SQLite sync calls block the event loop | Low at target | Latency | Indexes, limit cap, 10k benchmark |
| Search scan slows with growth | Medium | Slow search | Accept at 10k; FTS5 deferred |
| Timestamp collision in tests | Medium | Flaky assertions | Use `>=`; fake timers |
| Test DB leakage | Medium | Flaky tests | Fresh `:memory:` per test; inject repository |
| WAL files committed | Low | Repository noise | `.gitignore`; clean shutdown |
| Migration mistake | Low | Startup failure | Transactional migrations; version tests |
| No-auth exposure | Medium if misconfigured | Full data access | Loopback default; warning; README security note |
| Unescaped search wildcards | Medium | Wrong results | Escape function plus literal-wildcard tests |
| Body/content-type edge cases | Medium | Wrong status codes | Explicit middleware and integration tests |
| Scope creep | Medium | Delayed release | `SPEC.md` change control; phase gates |

---

## 13. Definition of done

- [ ] All acceptance criteria in `SPEC.md` §14 are verified.
- [ ] `npm ci && npm run verify` passes from a clean clone.
- [ ] `npm run build` succeeds and `node dist/server.js` answers `GET /healthz`.
- [ ] `npm run test:coverage` meets the 85% core target.
- [ ] Every endpoint is demonstrated in the README.
- [ ] Persistence works across restart.
- [ ] Health, graceful shutdown, and error mapping work.
- [ ] Logs contain no task content or search terms.
- [ ] No secrets, database files, or generated output are tracked.
- [ ] `AGENTS.md`, `SPEC.md`, `ARCHITECTURE.md`, `PLAN.md`, and the README agree.
- [ ] No out-of-scope feature is present.

---

## 14. Out of scope

- Accounts, authentication, authorization, and per-user isolation.
- Teams, sharing, assignments, comments, attachments, subtasks.
- Due dates, reminders, priorities, tags, recurring tasks.
- Reopen, soft delete, archive, restore, audit history.
- Bulk operations, import/export.
- CORS, rate limiting, public deployment hardening.
- UI, real-time updates, webhooks.
- Ranked/full-text search and accent-insensitive search.
- Cursor pagination, ETag/version concurrency.
- OpenAPI generation, Docker, hosted infrastructure, backup tooling.

---

## 15. Change control

- The approved scope is defined by `SPEC.md`; changes to observable behavior require a
  specification update and re-approval.
- Phase order may change if a dependency requires it, but no gate is skipped.
- `ARCHITECTURE.md` may change implementation details without re-approval as long as
  `SPEC.md` behavior is preserved.
- Any new dependency or runtime change must be recorded in `ARCHITECTURE.md`.
- Documentation is updated in the same phase that changes behavior.
