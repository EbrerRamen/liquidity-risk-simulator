# Development Checklist

Living checklist. Update it at the end of every milestone. Details for each item are in [docs/TECHNICAL_PLAN.md](docs/TECHNICAL_PLAN.md) §7.

Legend: `[x]` done · `[ ]` to do · `[~]` in progress

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
- [ ] **Plan reviewed and open questions answered (§9)**

## Phase 2: Backend foundation
- [ ] M2.1 Tooling: monorepo, uv, ruff, mypy, pytest, pre-commit, `.env.example`, CI (lint + tests + Postgres)
- [ ] M2.2 Database: ORM models, initial Alembic migration, reference data, app settings
- [ ] M2.3 Security core: JWT auth, refresh rotation, RBAC, audit helper, problem+json errors, request IDs
- [ ] M2.4 CRUD APIs for all master data, plus the deal schedule engine (day count, Modified Following)
- [ ] M2.5 Synthetic data generator and `lrs seed` (reproducible, under 60s)

## Phase 3: Frontend foundation
- [ ] M3.1 Design system: tokens, typography, UI primitives, chart wrappers, generated API types
- [ ] M3.2 App shell, auth flow, role-aware navigation
- [ ] M3.3 Data management screens (tables, filters, forms, drawers, CSV export)
- [ ] M3.4 Dashboard v1 (SQL aggregates, date-range filter, drill-down)

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
