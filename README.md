# Financial Risk & Liquidity Simulator

A full-stack platform for analysing liquidity positions, money-market maturities, counterparty and currency exposures, and liquidity stress scenarios, with explainable ML risk intelligence.

> **Status:** The frontend is being built ahead of the backend, against an in-browser mock API. Sign-in, the app shell, the dashboard, all eight data-management screens and the Admin screens (users, audit log, settings) work. The backend, financial engines, stress testing, ML and reports are not started. See the [development checklist](CHECKLIST.md) for details.
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

Other scripts: `npm run typecheck` and `npm run build`.

## Repository layout

| Path | Contents |
|---|---|
| `frontend/` | React app. `src/features/` holds the screens, `src/api/` the API client, and `src/mocks/` the mock API it calls until the backend exists. |
| `docs/` | [Technical plan](docs/TECHNICAL_PLAN.md): architecture, database design, API, financial methodology, ML strategy, roadmap |
| `backend/` | Not created yet (Phase 2) |

## Stack

| Layer | Technologies | State |
|---|---|---|
| Frontend | React, Vite, TypeScript, Tailwind CSS, React Router, TanStack Query and Table, React Hook Form, zod, Recharts, Lucide React | In use |
| Backend | Python, FastAPI, SQLAlchemy, Pydantic, Alembic | Planned |
| Database | PostgreSQL | Planned |
| ML / AI | pandas, NumPy, scikit-learn, XGBoost, optional local LLM via Ollama | Planned |
| Infrastructure | Docker Compose, pytest, GitHub Actions | Planned |
