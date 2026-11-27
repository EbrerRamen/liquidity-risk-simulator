"""Database engine (TECHNICAL_PLAN D2: sync SQLAlchemy 2.0 with psycopg 3)."""

from sqlalchemy import Engine, create_engine

#: Seconds to wait for a connection, so a readiness check fails fast rather than hanging.
CONNECT_TIMEOUT_S = 3


def make_engine(url: str) -> Engine:
    # pool_pre_ping replaces connections the server has dropped (restarts, idle timeouts).
    return create_engine(url, pool_pre_ping=True, connect_args={"connect_timeout": CONNECT_TIMEOUT_S})
