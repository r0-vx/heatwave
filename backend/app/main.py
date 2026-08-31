from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.routes import router
from .config import settings
from .database import SessionLocal, init_db
from .seed import seed_demo_data


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        init_db()
        db = SessionLocal()
        try:
            seed_demo_data(db)
        finally:
            db.close()
    except Exception:
        # Keep the process up so /api/health can report the database failure and
        # the frontend can show a useful Data unavailable state.
        pass
    yield


app = FastAPI(
    title="HeatShield — Mumbai Heat-Health Operations",
    description="Local municipal decision-support for thermal stress, ward vulnerability, source provenance, alert review and heat action planning.",
    version="0.2.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)


@app.get("/", tags=["system"])
def root() -> dict[str, str]:
    return {"service": "HeatShield Mumbai Operations API", "docs": "/docs", "health": "/api/health"}
