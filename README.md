# Task Management API

A single-user task management API that runs locally with Node.js and one SQLite
file. No accounts, no external services.

> **Status:** Phase 0 scaffold. Tooling, scripts, and configuration are in place;
> no endpoints or storage code exist yet.

## Requirements

- Node.js 24 (see `.nvmrc`)
- npm (lockfile is committed)

## Setup

```bash
npm ci
```

Optional configuration: copy `.env.example` to `.env` and adjust. Every variable
has a default, so the API runs without a `.env` file.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start with `tsx watch` |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run the compiled build |
| `npm run lint` | ESLint |
| `npm run format` | Prettier write |
| `npm run format:check` | Prettier check |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Tests in watch mode |
| `npm run test:coverage` | Coverage report and thresholds |
| `npm run verify` | lint → typecheck → test |

Run `npm run verify` before opening a change.

## Run

```bash
npm run dev
```

The server listens on `http://127.0.0.1:3000` by default. `GET /healthz` reports
storage health once Phase 4 lands.

## Test

```bash
npm test
npx vitest run tests/scaffold.test.ts
```

Tests run offline against a fresh database per test; none touch `./data`.

## Database reset

The database lives at `DATABASE_PATH` (default `./data/tasks.db`). To reset:

```bash
# stop the process, then
rm -rf data/
```

The directory and schema are recreated on the next start.

## Documentation

- [`docs/SPEC.md`](docs/SPEC.md) — behavior and acceptance criteria
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — design
- [`docs/PLAN.md`](docs/PLAN.md) — delivery plan

## Security

There is no authentication. The server binds to loopback by default; anyone who
can reach the port can read and modify all tasks. Do not expose it to a network.
