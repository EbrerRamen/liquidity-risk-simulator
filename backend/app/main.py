"""App factory (TECHNICAL_PLAN §2). Run with `uvicorn app.main:app --reload` from `backend/`."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app import __version__
from app.api.v1 import health
from app.core.config import Settings, get_settings
from app.db.engine import make_engine

API_PREFIX = "/api/v1"


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    engine = make_engine(settings.database_url)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        yield
        engine.dispose()

    app = FastAPI(
        title="Liquidity Risk Simulator API",
        version=__version__,
        # Served under /api so the Vite and nginx proxies forward the docs with the API.
        openapi_url="/api/openapi.json",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.engine = engine
    app.include_router(health.router, prefix=API_PREFIX)
    return app


app = create_app()
