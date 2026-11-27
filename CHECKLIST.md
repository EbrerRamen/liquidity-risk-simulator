# Development Checklist

Living checklist. Update it at the end of every milestone. Details for each item are in [docs/TECHNICAL_PLAN.md](docs/TECHNICAL_PLAN.md) §7.

Legend: `[x]` done · `[ ]` to do · `[~]` in progress

## Current state (2026-11-26)

The frontend is being built ahead of the backend. Every screen reads from an in-browser mock API in `frontend/src/mocks/`, which follows the §4 contract and the §5 formulas and keeps its data in `sessionStorage`. The functions in `frontend/src/api/` call the mocks directly, so when the backend exists only their bodies change. There is no `backend/` directory yet.

No Phase 3 milestone is marked done, because each exit criterion in §7 needs the real API and seeded data. The sub-items under each `[~]` milestone show which parts are built.

**Next up:** finish M2.1 by pushing, so CI runs on GitHub, then M2.2 (ORM models, first Alembic migration, reference data, app settings). Every Phase 3 screen exists against the mock API, so the backend comes before any Phase 4 screens; that way the §5 engines aren't written twice (once in the TypeScript mocks and again in Python).

## Phase 1: Planning
- [x] Requirements analysis and ambiguity resolutions (§0.3)
- [x] System architecture (§1)
- [x] Directory structure (§2)
- [x] Database design and ER diagrams (§3)
- [x] API specification (§4)
- [x] Financial methodology (§5)
- [x] ML strategy and synthetic data design (§6)
- [x] Roadmap and testing strategy (§7)
- [x] Technical challenges (§8)
- [x] Plan reviewed and open questions answered (§9)

## Phase 2: Backend foundation
- [~] M2.1 Tooling: monorepo, uv, ruff, mypy, pytest, pre-commit, `.env.example`, CI (lint + tests + Postgres)
  - [x] `backend/`: uv project on Python 3.13, FastAPI app with `/api/v1/health` and `/health/ready`, ruff, mypy (strict), pytest with coverage
  - [x] `docker-compose.yml` with PostgreSQL 18 (`lrs` and `lrs_test` databases), `.env.example`
  - [x] Frontend: ESLint and Vitest, with first tests for decimal parsing, the business-day calendar and number formatting
  - [x] `.pre-commit-config.yaml`; `.github/workflows/ci.yml` (backend with a Postgres service, frontend lint, type-check, test, build)
  - [ ] CI green on GitHub (exit criterion): runs on the next push
- [ ] M2.2 Database: ORM models, initial Alembic migration, reference data, app settings
- [ ] M2.3 Security core: JWT auth, refresh rotation, RBAC, audit helper, problem+json errors, request IDs
- [ ] M2.4 CRUD APIs for all master data, plus the deal schedule engine (day count, Modified Following)
- [ ] M2.5 Synthetic data generator and `lrs seed` (reproducible, under 60s)

## Phase 3: Frontend foundation
- [~] M3.1 Design system: tokens, typography, UI primitives, chart wrappers, generated API types
  - [x] Vite, TypeScript, Tailwind v4, tokens, typography, UI primitives, Recharts chart wrappers
  - [x] Component gallery at `/design-system` (development builds only)
  - [ ] Generated API types. `frontend/src/api/types.ts` is written by hand until the backend publishes OpenAPI.
- [~] M3.2 App shell, auth flow, role-aware navigation
  - [x] Sign-in page, app shell, sidebar, top bar with breadcrumb, role-aware navigation and route guards
  - [x] Session restored on reload, access token refreshed before expiry (against the mock `/auth/refresh`)
  - [x] Edit actions hidden from viewers
  - [x] Error boundary: a failing page is replaced inside the shell; a full-page fallback covers the shell itself
  - [x] Users screen (`/admin/users`): create, edit name and role, deactivate and reactivate; admins can't demote or deactivate themselves or the last admin
  - [x] Settings screen (`/admin/settings`): simulation business date (moves every mock calculation), minimum liquidity buffer, facilities default
  - [ ] Working against the real auth API
- [~] M3.3 Data management screens (tables, filters, forms, drawers, CSV export)
  - [x] Shared list, detail and editor components: paging, sorting, filters, search, detail drawers, zod-validated forms, CSV export
  - [x] Counterparties, MM deals (with schedule preview), cash flows, funding sources, liquid assets, cash accounts, currency exposures, FX rates
  - [x] Audit Log screen (`/admin/audit`): cursor-paged, filters by user, action, record type and date, field-level diffs; sign-ins are audited
  - [ ] Full CRUD against the real API and seeded data (exit criterion)
- [~] M3.4 Dashboard v1 (SQL aggregates, date-range filter, drill-down)
  - [x] KPIs, cash history, projection, flows, maturity, concentration and risk charts, maturities table, findings
  - [x] Horizon, lookback and currency filters kept in the URL, drill-down links to the data screens
  - [x] Loading, empty and error states
  - [ ] Figures from SQL aggregates in the real API (exit criterion)

## Phase 4: Financial calculation engine
- [ ] M4.1 Core position engine plus worked-example golden test plus Hypothesis invariants
- [ ] M4.2 Gaps, ladder, WAM, FR/SH, SLCI, concentration, funding dependency, NOP
- [ ] M4.3 Liquidity API and UI, dashboard switched to engine KPIs
- [ ] M4.4 `docs/methodology/liquidity.md` (all examples are tests)

## Phase 5: Stress testing
- [ ] M5.1 Lever schemas, scenario CRUD, presets, templates endpoint
- [ ] M5.2 Stress engine: baseline, levers a–e, FX netting, attribution
- [ ] M5.3 Execution persistence, fingerprints, comparison
- [ ] M5.4 Scenario builder, results and comparison UI

## Phase 6: AI/ML
- [ ] M6.1 Forecast datasets, features, backtest framework, baselines
- [ ] M6.2 Ridge/XGBoost forecaster, conformal intervals, champion selection
- [ ] M6.3 Anomaly detection, evaluation against ground truth, review workflow
- [ ] M6.4 Counterparty scorecard, delay-propensity model, risk matrix UI
- [ ] M6.5 Insights: facts, rules, templates, optional Ollama, guardrails
- [ ] M6.6 Model registry UI and generated `docs/ml-evaluation.md`

## Phase 7: Reports and finalisation
- [ ] M7.1 PDF and CSV report exports
- [ ] M7.2 Dockerfiles, Docker Compose (`migrate`, `llm` profile), CI image build and smoke test
- [ ] M7.3 Test hardening and coverage targets
- [ ] M7.4 Documentation complete (README, architecture, ER, API, methodology, limitations)

## Stretch backlog (after Phase 7 only)
- [ ] Reverse stress testing
- [ ] Monte Carlo stress distributions
- [ ] Holiday calendars
- [ ] CSV bulk import
- [ ] Light theme
- [ ] End-of-day simulation (advance business date)
- [ ] Counterparty groups
- [ ] Methodology Q&A (retrieval-grounded)
