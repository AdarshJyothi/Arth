from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.routers import market

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(market.router)

@app.get("/")
def root():
    return {"app": settings.APP_NAME, "version": settings.APP_VERSION, "status": "running"}

from app.routers.auth import router as auth_router
# inside the section where other routers are included:
app.include_router(auth_router, prefix="/api/v1")

from app.routers.portfolio import router as portfolio_router
app.include_router(portfolio_router, prefix="/api/v1")

from app.routers.screener import router as screener_router
app.include_router(screener_router, prefix="/api/v1")

# Ensure all model tables exist (idempotent — only creates missing tables).
# Guards against models added after the initial Alembic migration (sells, alerts, dividends).
# NB: use `from app.models import ...` — `import app.models.x` would rebind the
# name `app` in this module and shadow the FastAPI instance above.
from app.db.base import Base
from app.db.session import engine
from app.models import user, holding, sell, alert, dividend, transaction, watchlist  # noqa: F401
Base.metadata.create_all(bind=engine)