# Backend

FastAPI app (Python 3.13, managed with [uv](https://docs.astral.sh/uv/)). The layout and layering rules are in [docs/TECHNICAL_PLAN.md](../docs/TECHNICAL_PLAN.md) §1–2.

## Run it

From the repository root, start the database once (PostgreSQL 18 in Docker, data kept in a volume):

```sh
cp .env.example .env          # optional: the defaults already match
docker compose up -d db
```

Then from `backend/`:

```sh
uv sync                                   # create .venv with the locked dependencies
uv run uvicorn app.main:app --reload      # http://localhost:8000/api/docs
```

With the frontend dev server running, the app reaches the API through Vite's `/api` proxy.

## Checks

The same commands CI runs:

```sh
uv run ruff check .
uv run ruff format --check .
uv run mypy
uv run pytest --cov                       # integration tests need the database
uv run pytest -m "not integration"        # without the database
```

Integration tests use `TEST_DATABASE_URL` (default: the `lrs_test` database that `docker compose` creates).

To run the checks on every commit: `uv run pre-commit install` (config in the repository root).
