from __future__ import annotations

import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.retrieval.hybrid_retriever import HybridCodeRetriever, RetrievedChunk

router = APIRouter(prefix="/repositories", tags=["Search"])


class SearchRequest(BaseModel):
    query: str
    limit: int = 10


class SearchResultItem(BaseModel):
    chunk_id: uuid.UUID
    file_path: str
    language: str
    start_line: int
    end_line: int
    raw_code: str
    symbol_name: Optional[str]
    symbol_kind: Optional[str]
    dense_score: float
    sparse_score: float
    rrf_score: float
    final_score: float


class SearchResponse(BaseModel):
    query: str
    total_results: int
    results: List[SearchResultItem]


retriever = HybridCodeRetriever()


@router.post("/{repo_id}/search", response_model=SearchResponse)
async def hybrid_search_repository(
    repo_id: uuid.UUID,
    payload: SearchRequest,
    db: AsyncSession = Depends(get_db),
):
    query = payload.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Search query cannot be empty")

    chunks: List[RetrievedChunk] = await retriever.retrieve(
        session=db,
        repository_id=repo_id,
        query=query,
        top_k=payload.limit,
    )

    items = [
        SearchResultItem(
            chunk_id=c.chunk_id,
            file_path=c.file_path,
            language=c.language,
            start_line=c.start_line,
            end_line=c.end_line,
            raw_code=c.raw_code,
            symbol_name=c.symbol_name,
            symbol_kind=c.symbol_kind,
            dense_score=round(c.dense_score, 4),
            sparse_score=round(c.sparse_score, 4),
            rrf_score=round(c.rrf_score, 4),
            final_score=round(c.final_score, 4),
        )
        for c in chunks
    ]

    return SearchResponse(query=query, total_results=len(items), results=items)

