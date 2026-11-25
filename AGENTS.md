# Task Management API — Agent Guide

`docs/SPEC.md` is the source of truth for behavior; `docs/ARCHITECTURE.md` for
structure. Do not invent or extend domain behavior — changes require a spec update.

## Baseline stack
Use these unless the user directs otherwise:
- Node 24 LTS, TypeScript ESM (`"type": "module"`), `strict` + `noUncheckedIndexedAccess`
- npm with a committed `package-lock.json`
- Express 5, Zod, pino, Vitest + Supertest, ESLint + Prettier
- `tsx` for dev; `tsc` builds to `dist/`
- PostgreSQL 17 persistence via `pg` connection pool, explicit SQL, and `schema_migrations` + `pg_advisory_lock` behind a repository interface. No ORM, no database server in the API process. Each test gets an isolated schema.

## Commands (define these in `package.json`)
| Script | Command |
| --- | --- |
| `dev` | `tsx watch src/server.ts` |
| `build` | `tsc -p tsconfig.build.json` |
| `start` | `node dist/server.js` |
| `lint` | `eslint .` |
| `format` | `prettier --write .` |
| `format:check` | `prettier --check .` |
| `typecheck` | `tsc --noEmit` |
| `db:up` | Start PostgreSQL 17 via Docker Compose |
| `db:down` | Stop the PostgreSQL service |
| `db:logs` | Stream PostgreSQL logs |
| `db:migrate` | Run pending migrations |
| `db:reset` | Drop and recreate the database |
| `test` | `vitest run` |
| `test:watch` | `vitest` |
| `test:coverage` | `vitest run --coverage` |
| `benchmark` | `tsx scripts/benchmark.ts` |
| `verify` | lint, then typecheck, then test |
| `dev:dashboard` | Start the Vite dashboard dev server (port 5173, proxying API) |
| `build:dashboard` | Build the dashboard static bundle |
| `test:dashboard` | Run the dashboard test suite |
| `verify:dashboard` | Dashboard lint → typecheck → test |
| `verify:all` | API and dashboard lint → typecheck → test |

- Run `npm run verify:all` before claiming work is done; otherwise state that it was not run.
- Single test: `npx vitest run tests/integration/tasks.test.ts -t "creates a task"`.
- Single dashboard test: `npm --prefix dashboard run test -- src/App.test.tsx`.
- Single file: `npx vitest run tests/integration/tasks.test.ts`.
- Benchmark: `npm run benchmark` seeds 10,000 tasks in a temporary database and checks p95 budgets. It never writes to `./data`.

## Structure and boundaries
```
src/
  server.ts      # load config, open DB, migrate, app.listen — never imported by tests
  app.ts         # builds and returns the Express app
  shutdown.ts    # HTTP drain + database close, used by server.ts
  config.ts      # the only module that reads process.env
  errors.ts      # AppError + stable error codes
  routes/        # HTTP parsing and status codes only (tasks, health)
  schemas/       # Zod request/response schemas + z.infer types
  services/      # business rules, framework-free
  repositories/  # storage interface only
  db/            # connection, migrations, row mapper, PostgreSQL repository
  middleware/    # error handler, request logging
scripts/
  benchmark.ts   # manual 10k-task performance run; excluded from the build
tests/
  unit/          # schemas, services, repository, migrations, mapper, connection, error handler
  integration/   # Supertest HTTP behavior, persistence, health, shutdown
```

- Import `app` from `src/app.ts` in Supertest tests; never bind a port in tests.
- Validate every body, query, and param with Zod. Derive types via `z.infer`; do not hand-write duplicate interfaces.
- Keep `services/` free of Express types and I/O concerns; pass plain objects in and out.
- Validate env in `config.ts` with Zod at startup and fail fast. Do not touch `process.env` elsewhere.
- JSON errors: `{ "error": { "code", "message", "details"? } }`. Use 400 for validation, 404 for missing, 413 for an oversized body, 415 for a wrong media type, 409 for a uniqueness or reference constraint violation (CONFLICT), 502 for a connector error (CONNECTOR_ERROR), 503 for unavailable storage (STORAGE_UNAVAILABLE), and 500 for unexpected failures.
- Mount routes under `/api/v1`; expose `GET /healthz`.
- Use UUIDs for IDs and ISO 8601 UTC strings for timestamps.

### Dashboard boundaries
- The dashboard lives in `dashboard/` and is a Vite + React 19 + TypeScript SPA.
- It communicates with the API only through the documented `/api/v1` endpoints.
- It never opens PostgreSQL or imports from `src/`.
- Its only integration point is the typed API client in `dashboard/src/api/client.ts`.
- Dashboard tests mock `fetch`; they never start the API or touch the database.
- Dashboard ESLint config and `tsconfig` are independent; they do not affect the API.
- Root ESLint ignores `dashboard/`; dashboard ESLint ignores root `src/`.

## Testing
- Vitest + Supertest; no network or external services.
- Build a fresh app and repository per test; never share mutable state or depend on test order.
- All tests use isolated PostgreSQL schemas; no test touches the development database.
- Cover validation failures and not-found alongside happy paths.

## Repo hygiene
- The repository is initialized on `main` with `origin` configured. Commit and push approved phase work after its gate passes; ask before rewriting history, force-pushing, or starting unrelated commits.
- Never commit `.env`, `dist/`, `node_modules/`, database files, WAL/SHM files, or coverage output. `.env.example` documents every variable.
- Keep `README.md` focused on setup, run, and test instructions; keep agent-specific rules only in this file.
