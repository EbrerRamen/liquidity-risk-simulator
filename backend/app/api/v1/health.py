"""Liveness and readiness probes (TECHNICAL_PLAN §4.3). Public: no authentication."""

import logging
from typing import Literal

from fastapi import APIRouter, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import Engine, text
from sqlalchemy.exc import SQLAlchemyError

log = logging.getLogger(__name__)
router = APIRouter(prefix="/health", tags=["system"])


class Liveness(BaseModel):
    status: Literal["ok"]


class Readiness(BaseModel):
    status: Literal["ok", "unavailable"]
    database: Literal["ok", "unreachable"]


@router.get("")
def liveness() -> Liveness:
    """The process is up and serving requests."""
    return Liveness(status="ok")


@router.get("/ready", responses={503: {"model": Readiness, "description": "The database can't be reached"}})
def readiness(request: Request, response: Response) -> Readiness:
    """The app can serve real traffic: the database answers a query."""
    engine: Engine = request.app.state.engine
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except SQLAlchemyError:
        log.warning("Readiness check failed: database unreachable", exc_info=True)
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return Readiness(status="unavailable", database="unreachable")
    return Readiness(status="ok", database="ok")
