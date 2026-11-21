# Task Management API - GitHub Actions CI/CD Deployment Plan

## Overview

This document outlines the GitHub Actions CI/CD pipeline for the Task Management API project.
The pipeline automates testing, building, and verification for both the API and dashboard components.

**Important:** This project currently runs on Node.js with Express and `node:sqlite`. This plan
assumes the existing infrastructure remains in place.

---

## Repository Structure

```
task-management-api/
├── .github/workflows/      # CI/CD workflows (to be created)
├── package.json            # Root scripts and dependencies
├── npm-lock.json           # Lockfile for reproducible installs
├── tsconfig.json           # TypeScript config (ESM, NodeNext, strict)
├── tsconfig.build.json     # Build config (emits to dist/)
├── eslint.config.js         # ESLint flat config
├── .gitignore              # Ignores node_modules, dist, coverage, data, .env, .playwright-mcp
├── dashboard/              # React 19 + Vite SPA (separate package.json, lockfile, config)
│   ├── vite.config.ts      # Proxy and test config
│   ├── package.json        # React dependencies
│   ├── tsconfig.json       # Strict TypeScript config
│   ├── src/                # Dashboard source
│   └── test/               # Dashboard jsdom tests with mocked fetch
├── src/                    # API source
│   ├── app.ts              # Express app builder
│   ├── server.ts           # Server entry (config → DB → migrate → app → listen)
│   ├── config.ts           # Zod-env validation
│   ├── errors.ts           # AppError codes
│   ├── routes/             # HTTP routes
│   ├── schemas/            # Zod validation schemas
│   ├── services/           # Framework-free business rules
│   ├── repositories/       # TaskRepository interface
│   ├── db/                 # connection, migrations, row-mapper, repository
│   └── middleware/         # error-handler, request-logger
├── tests/                  # Vitest test suite
│   ├── unit/               # schemas, services, repository, migrations, mapper, connection, error-handler
│   └── integration/        # Supertest HTTP, health, shutdown, persistence tests
├── scripts/                # benchmark.ts (10k-task performance)
├── docs/                   # Architecture, specification, plan, acceptance records
├── data/                   # Runtime SQLite file (gitignored)
└── dist/                   # API build output (gitignored)
```

---

## CI/CD Pipeline Objectives

| Goal | Description |
|------|-------------|
| **Fast feedback** | `npm run verify` runs in under 5 minutes on every PR |
| **Quality gate** | Lint, typecheck, and test must all pass before merge |
| **Dashboard coverage** | Dashboard `api/` and `lib/` modules must meet 80% coverage thresholds |
| **API coverage** | Core logic (services + repository + row-mapper) must meet 85% coverage |
| **Build verification** | Both `npm run build` and `npm run build:dashboard` must succeed |
| **No secrets leakage** | `.env`, database files, coverage output must never be tracked |
| **Isolated test environments** | Each PR gets a fresh database; no shared mutable state |

---

## Workflow Files

### `.github/workflows/ci.yml` - Main CI Pipeline

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]
  workflow_dispatch:

jobs:
  # ------------------------------------------------------------
  # 1. Lint and Typecheck
  # ------------------------------------------------------------
  lint-typecheck:
    name: Lint + Typecheck
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: .
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run ESLint
        run: npm run lint

      - name: Run Typecheck
        run: npm run typecheck

  # ------------------------------------------------------------
  # 2. API Tests
  # ------------------------------------------------------------
  api-tests:
    name: API Test Suite
    runs-on: ubuntu-latest
    needs: lint-typecheck
    defaults:
      run:
        working-directory: .
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run API test suite
        run: npm run test

      - name: Run API test coverage
        run: npm run test:coverage

      - name: Upload coverage report
        uses: actions/upload-artifact@v4
        with:
          name: api-coverage
          path: coverage/
          retention-days: 30

  # ------------------------------------------------------------
  # 3. Dashboard Tests
  # ------------------------------------------------------------
  dashboard-tests:
    name: Dashboard Test Suite
    runs-on: ubuntu-latest
    needs: lint-typecheck
    defaults:
      run:
        working-directory: ./dashboard
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: 'npm'

      - name: Install dashboard dependencies
        run: npm ci

      - name: Run dashboard test suite
        run: npm run test

      - name: Run dashboard test coverage
        run: npm run test:dashboard:coverage

      - name: Upload coverage report
        uses: actions/upload-artifact@v4
        with:
          name: dashboard-coverage
          path: dashboard/coverage/
          retention-days: 30

  # ------------------------------------------------------------
  # 4. Build Verification
  # ------------------------------------------------------------
  build-verification:
    name: Build Verification
    runs-on: ubuntu-latest
    needs: [api-tests, dashboard-tests]
    defaults:
      run:
        working-directory: .
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build API
        run: npm run build

      - name: Build Dashboard
        run: npm run build:dashboard

      - name: Verify dashboard dist exists
        run: ls dashboard/dist/index.html

  # ------------------------------------------------------------
  # 5. Full Verification
  # ------------------------------------------------------------
  verify:
    name: Full Verification (verify:all)
    runs-on: ubuntu-latest
    needs: build-verification
    defaults:
      run:
        working-directory: .
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run full verification
        run: npm run verify:all

      - name: Publish verification results
        if: success()
        uses: actions/upload-artifact@v4
        with:
          name: verification-results
          path: |
            .playwright-mcp/*.png
            docs/dashboard.png
          retention-days: 30
```

### `.github/workflows/coverage.yml` - Coverage Reports (Optional)

```yaml
name: Coverage

on:
  schedule:
    - cron: '0 2 * * 0'   # Weekly Sunday 02:00 UTC
  workflow_dispatch:

jobs:
  coverage:
    name: Generate Coverage Report
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: .
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run API coverage
        run: npm run test:coverage

      - name: Run dashboard coverage
        run: npm run test:dashboard:coverage

      - name: Comment on PR with coverage summary
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          comment_mode: update
          script: |
            const apiCoverage = ...;  # parse coverage output
            const dashboardCoverage = ...;
            # (template omitted for brevity)
```

---

## Pipeline Details

### 1. Lint + Typecheck (`lint-typecheck` job)
- Runs on every push and PR
- Uses `npm ci` for clean, reproducible installs
- Enforces ESLint rules via `npm run lint`
- Enforces TypeScript strict mode via `npm run typecheck`
- Fails fast if code style or type contracts are violated

### 2. API Tests (`api-tests` job)
- Executes `npm run test` (Vitest + Supertest suite, 151 tests)
- Executes `npm run test:coverage` (enforces 85% core logic thresholds)
- Uploads coverage artifact for 30 days
- Uses `:memory:` SQLite databases; no test touches `./data`

### 3. Dashboard Tests (`dashboard-tests` job)
- Runs in a separate job with `working-directory: ./dashboard`
- Executes `npm run test` (27 tests with mocked `fetch`, jsdom environment)
- Executes `npm run test:dashboard:coverage` (80% thresholds on `api/` and `lib/`)
- Uploads coverage artifact for 30 days
- `fetch` is mocked per test; no live API or database is used

### 4. Build Verification (`build-verification` job)
- Runs after both API and dashboard tests pass
- Executes `npm run build` (API tsc build to `dist/`)
- Executes `npm run build:dashboard` (Vite build to `dashboard/dist/`)
- Verifies `dashboard/dist/index.html` exists
- Ensures both bundles compile without errors

### 5. Full Verification (`verify` job)
- Runs after build verification succeeds
- Executes `npm run verify:all` (API + dashboard lint → typecheck → test)
- This is the canonical "gate" before merging
- Uploads verification artifacts: Playwright screenshots and `docs/dashboard.png`

---

## Local Development Commands (for contributors)

| Command | Purpose |
|---------|---------|
| `npm run verify` | Lint → typecheck → test (API only) |
| `npm run verify:dashboard` | Dashboard lint → typecheck → test |
| `npm run verify:all` | API and dashboard full verification |
| `npm run build` | API TypeScript build |
| `npm run build:dashboard` | Dashboard Vite build |
| `npm run test` | API test suite once |
| `npm run test:dashboard` | Dashboard test suite |
| `npm run test:coverage` | API coverage with thresholds |
| `npm run test:dashboard:coverage` | Dashboard coverage with thresholds |
| `npm run lint` | ESLint on root (ignores `dashboard/`) |
| `npm --prefix dashboard run lint` | Dashboard ESLint |
| `npm run benchmark` | Seed 10k tasks and measure p95 latency |

---

## Environment & Tooling

| Item | Description |
|------|-------------|
| **Node version** | `24` (pinned in `.nvmrc`; `package.json` engines `>=24`) |
| **Package manager** | `npm` with committed `package-lock.json` |
| **Test runner** | `vitest` (unit + integration) |
| **HTTP testing** | `supertest` against Express app (Supertest) |
| **Dashboard tests** | `vitest` + `@testing-library/react` + `jsdom` (mocked `fetch`) |
| **Coverage** | `vitest` + `@vitest/coverage-v8` (v8 inliner) |
| **ESLint** | Flat config (`eslint.config.js`) with `dashboard/` ignored at root |
| **Cache strategy** | GitHub Actions `actions/cache` for `node_modules` keyed on `package-lock.json` |
| **Test isolation** | Each job runs `npm ci` fresh; databases use `:memory:` or temp directories |
| **Artifacts** | Coverage and screenshot artifacts retained 30 days; not tracked in git |

---

## Secrets & Configuration

| Variable | Source | Description |
|----------|--------|-------------|
| `NODE_ENV` | `development` default; override via repo secret for CI | Affects `config.ts` validation and test behavior |
| `PORT` | `3000` default; can be overridden per environment | API bind port |
| `HOST` | `127.0.0.1` default; non-loopback warns about no-auth | API bind address |
| `DATABASE_PATH` | `./data/tasks.db` default; temp path in CI | SQLite file path (`:memory:` for unit tests) |
| `LOG_LEVEL` | `info` default | pino log level |
| `VITE_API_BASE_URL` | `/api/v1` default; can be overridden via secret | Dashboard API base URL |
| `VITE_HEALTH_URL` | `/healthz` default | Dashboard health endpoint |
| `TASK_API_URL` | `http://127.0.0.1:3000` default; proxy target | Override Vite dev server proxy target |

**No secrets are required for the CI pipeline to run.** All defaults are baked into the codebase.
Only `DATABASE_PATH` needs overriding if a non-default SQLite location is desired.

---

## Migration Path Considerations

| From | To | Effort | Notes |
|------|-----|--------|-------|
| Current Express + `node:sqlite` | This plan's workflows | **Low** | Add the `.github/workflows/` files shown above. Can be implemented incrementally. |
| Dashboard in `dashboard/` | Dashboard moved to separate repo | **Medium** | Dashboard has its own `package.json`, `lockfile`, `tsconfig`, and config. Could be extracted but currently co-located for convenience. |

---

## Appendices

### A. Artifact Summary

| Artifact | Path | Description |
|----------|------|-------------|
| API coverage | `coverage/` | Generated by `vitest run --coverage`; 85% statements/branches/functions/lines threshold |
| Dashboard coverage | `dashboard/coverage/` | Generated by `vitest run --coverage` in dashboard; 80% statements/branches/functions/lines/threshold |
| Verification screenshots | `.playwright-mcp/*.png` + `docs/dashboard.png` | Manual browser verification captures (light, dark, mobile, modal, search, pagination, delete) |
| Build outputs | `dist/` + `dashboard/dist/` | `tsc` emit + `vite build`; gitignored |

### B. Failure Handling

| Failure Type | Detection | Response |
|--------------|-----------|----------|
| Lint error | `npm run lint` exits non-zero | PR blocked; fix locally, push new commits |
| Type error | `tsc --noEmit` exits non-zero | PR blocked; fix type signatures |
| Test failure | `npm run test` exits non-zero | PR blocked; investigate test output, fix or skip with justification |
| Coverage gap | `npm run test:coverage` below threshold | PR blocked; increase coverage or adjust thresholds (requires spec change) |
| Build failure | `npm run build` exits non-zero | PR blocked; fix TypeScript or Vite config |
| Dashboard build failure | `npm run build:dashboard` exits non-zero | PR blocked; fix Vite config or React types |

### C. Pull Request Checklist

Before requesting a review, ensure:
- [ ] `npm run verify:all` passes on the local machine
- [ ] `npm run build` succeeds
- [ ] `npm run build:dashboard` succeeds
- [ ] No new lint or type errors introduced
- [ ] Tests pass (run `npm run test` and `npm --prefix dashboard run test`)
- [ ] No `.env` or database files committed
- [ ] Coverage thresholds met (or a note explaining why not)
- [ ] Dashboard console is clean (no warnings/errors on `npm run dev:dashboard`)
- [ ] `docs/dashboard.png` updated if UI changed

---

## Related Documents

- [`docs/SPEC.md`](docs/SPEC.md) - Behavior and acceptance criteria
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) - Design and boundaries
- [`docs/PLAN.md`](docs/PLAN.md) - Delivery plan and phase gates
- [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md) - Criterion-by-criterion verification
- [`README.md`](README.md) - Setup, run, and test instructions
- [`dashboard/README.md`](dashboard/README.md) - Dashboard setup and features

---

*Plan generated for GitHub Actions CI/CD pipeline. No code changes to the existing Express + `node:sqlite` implementation are required.*
Last updated : 2026-11-22
