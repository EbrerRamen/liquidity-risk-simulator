# Financial Risk & Liquidity Simulator

A full-stack platform for analysing liquidity positions, money-market maturities, counterparty and currency exposures, and liquidity stress scenarios, with explainable ML risk intelligence.

> **Status:** The frontend runs against an in-browser mock API: sign-in, the app shell, the dashboard, all eight data-management screens and the Admin screens (users, audit log, settings) work. The backend has started (Phase 2): tooling, CI and a health-checked FastAPI app on PostgreSQL. Financial engines, stress testing, ML and reports are not started. See the [development checklist](CHECKLIST.md) for details.
>
> **All data in this project is synthetic.** The metrics are simulation metrics, not regulatory ratios.

## Running the frontend

Requires Node.js 20.19+ or 22.12+.

```sh
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 and sign in with one of the demo accounts listed on the sign-in page. All of them use the password `synthetic-demo-2026`:

| Account | Role |
|---|---|
| `admin@lrs.local` | Admin |
| `analyst@lrs.local` | Risk analyst |
| `viewer@lrs.local` | Viewer (read-only) |

Admins can add more accounts under Admin › Users. Sign-in and data come from the mock API in `frontend/src/mocks/`. Edits are kept in `sessionStorage`, so they survive a reload but not a new tab. Run `npm install` again after pulling changes to `package.json`.

Other scripts: `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`.

## Running the backend

Needs [uv](https://docs.astral.sh/uv/) and Docker Desktop. From the repository root:

```sh
docker compose up -d db                    # PostgreSQL 18 on 127.0.0.1:5432
cd backend
uv sync
uv run uvicorn app.main:app --reload       # API docs: http://localhost:8000/api/docs
```

The screens still use the mock API; they move to the real one as Phase 2 builds the endpoints. More in [backend/README.md](backend/README.md).

## Repository layout

| Path | Contents |
|---|---|
| `frontend/` | React app. `src/features/` holds the screens, `src/api/` the API client, and `src/mocks/` the mock API it calls until the backend exists. |
| `docs/` | [Technical plan](docs/TECHNICAL_PLAN.md): architecture, database design, API, financial methodology, ML strategy, roadmap |
| `backend/` | FastAPI app (Python 3.13, uv). See [backend/README.md](backend/README.md). |
| `docker-compose.yml` | Local PostgreSQL 18; the full stack arrives in Phase 7 |
| `.github/workflows/ci.yml` | Lint, type-check and tests for both halves, with a PostgreSQL service |

## Stack

| Layer | Technologies | State |
|---|---|---|
| Frontend | React, Vite, TypeScript, Tailwind CSS, React Router, TanStack Query and Table, React Hook Form, zod, Recharts, Lucide React | In use |
| Backend | Python, FastAPI, SQLAlchemy, Pydantic, Alembic | In progress |
| Database | PostgreSQL 18 | In use (Docker) |
| ML / AI | pandas, NumPy, scikit-learn, XGBoost, optional local LLM via Ollama | Planned |
| Infrastructure | Docker Compose, uv, ruff, mypy, pytest, ESLint, Vitest, GitHub Actions | In use |
