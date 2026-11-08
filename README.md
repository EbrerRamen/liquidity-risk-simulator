# Financial Risk & Liquidity Simulator

A full-stack platform for analysing liquidity positions, money-market maturities, counterparty and currency exposures, and liquidity stress scenarios, with explainable ML risk intelligence.

> **Status:** Phase 1 (planning) is complete and the plan is under review. No application code yet.
>
> **All data in this project is synthetic.** The metrics are simulation metrics, not regulatory ratios.

## Documents

- [Technical plan](docs/TECHNICAL_PLAN.md): architecture, database design, API, financial methodology, ML strategy, roadmap
- [Development checklist](CHECKLIST.md)

## Planned stack

| Layer | Technologies |
|---|---|
| Frontend | React, Vite, TypeScript, Tailwind CSS, Recharts, Lucide React |
| Backend | Python, FastAPI, SQLAlchemy, Pydantic, Alembic |
| Database | PostgreSQL |
| ML / AI | pandas, NumPy, scikit-learn, XGBoost, optional local LLM via Ollama |
| Infrastructure | Docker Compose, pytest, GitHub Actions |
