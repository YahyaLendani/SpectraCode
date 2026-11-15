from __future__ import annotations

import asyncio
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.api.router import api_router
from app.core.config import settings
from app.core.logging import configure_logging
from app.db.models import IndexingStatus, Repository
from app.db.session import AsyncSessionLocal, init_db

configure_logging(settings.LOG_LEVEL)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Initialize DB schema
    await init_db()

    # 2. Seed and index default sample repository if none exist
    async with AsyncSessionLocal() as session:
        stmt = select(Repository).limit(1)
        res = await session.execute(stmt)
        repo = res.scalar_one_or_none()

        if repo is None:
            sample_repo = Repository(
                id=uuid.uuid4(),
                github_owner="sample",
                github_name="fastapi-cloudflow",
                clone_url="sample:fastapi",
                default_branch="main",
                status=IndexingStatus.PENDING,
            )
            session.add(sample_repo)
            await session.commit()
            await session.refresh(sample_repo)

            # Fire initial indexing in background task with dedicated session
            from app.api.routes.repositories import run_indexing_task
            asyncio.create_task(run_indexing_task(sample_repo.id))

    yield


app = FastAPI(
    title=f"{settings.PROJECT_NAME} API",
    description="AI-Powered Codebase Intelligence Platform API with Grounded Citations & Hybrid Retrieval",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API routes
app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "database": "connected",
        "embedding_model": settings.EMBEDDING_MODEL,
    }


@app.get("/")
async def root():
    return {
        "name": f"{settings.PROJECT_NAME} API",
        "version": "1.0.0",
        "docs_url": "/docs",
        "health_url": "/health",
        "api_v1_prefix": settings.API_V1_STR,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

