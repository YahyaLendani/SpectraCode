from __future__ import annotations

from fastapi import APIRouter

from app.api.routes import chat, evaluation, repositories, search

api_router = APIRouter()
api_router.include_router(repositories.router)
api_router.include_router(search.router)
api_router.include_router(chat.router)
api_router.include_router(evaluation.router)

