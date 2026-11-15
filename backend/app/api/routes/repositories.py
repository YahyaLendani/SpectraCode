from __future__ import annotations

import asyncio
import json
import os
import shutil
import stat
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import noload, selectinload

from app.core.config import settings
from app.db.models import (
    ASTSymbol,
    ChunkEmbedding,
    CodeChunk,
    Conversation,
    EvaluationRun,
    EvaluationSampleResult,
    IndexingStatus,
    Message,
    Repository,
    RepositoryFile,
)
from app.db.session import AsyncSessionLocal, get_db
from app.ingestion.dependency_analyzer import CodebaseDependencyAnalyzer
from app.ingestion.git_importer import GitRepositoryImporter
from app.ingestion.worker import IndexingProgressTracker, RepositoryIndexingWorker

router = APIRouter(prefix="/repositories", tags=["Repositories"])

DEPENDENCY_CACHE_VERSION = "dependency_graph_v2"

# In-memory cache keyed by (repo_id_str, commit_sha, total_files) -> serialized graph dict
_DEPENDENCY_GRAPH_CACHE: Dict[Tuple[str, str, int], Dict[str, Any]] = {}


def _get_repo_storage_dir(repo: Repository) -> Path:
    return (
        settings.REPOS_STORAGE_DIR
        / f"{repo.github_owner}_{repo.github_name}_{repo.id.hex[:8]}"
    )


def _remove_repo_storage_dir_sync(repo_dir: Path) -> None:
    """
    Safely deletes a cloned repository directory from disk, handling read-only
    .git packfiles on Windows and ensuring the path resides inside REPOS_STORAGE_DIR.
    """
    if not repo_dir.exists():
        return
    try:
        resolved_base = settings.REPOS_STORAGE_DIR.resolve()
        resolved_target = repo_dir.resolve()
        if resolved_base not in resolved_target.parents:
            return

        def _on_rm_error(func: Any, path: str, exc_info: Any) -> None:
            try:
                os.chmod(path, stat.S_IWRITE)
                func(path)
            except OSError:
                pass

        shutil.rmtree(resolved_target, onerror=_on_rm_error)
    except OSError:
        shutil.rmtree(repo_dir, ignore_errors=True)


def _read_file_text_sync(disk_path: Path) -> str:
    if not disk_path.exists():
        return ""
    return disk_path.read_text(encoding="utf-8", errors="replace")


def _compute_dependency_graph_sync(
    repo_dir: Path, file_paths: Sequence[str]
) -> Dict[str, Any]:
    """
    Runs in a worker thread via asyncio.to_thread so synchronous disk I/O
    and CPU-bound static import analysis never block the asyncio event loop.
    """
    files_dict: Dict[str, str] = {}
    for rel_path in file_paths:
        disk_path = repo_dir / rel_path
        if disk_path.exists() and disk_path.is_file():
            try:
                files_dict[rel_path] = disk_path.read_text(
                    encoding="utf-8", errors="replace"
                )
            except OSError:
                continue

    graph = CodebaseDependencyAnalyzer.analyze(files_dict)
    return {
        "nodes": [
            {
                "id": n.id,
                "label": n.label,
                "kind": n.kind,
                "in_degree": n.in_degree,
                "out_degree": n.out_degree,
            }
            for n in graph.nodes
        ],
        "edges": [{"source": e.source, "target": e.target} for e in graph.edges],
        "external_packages": graph.external_packages,
        "internal_files_count": graph.internal_files_count,
        "circular_dependencies": graph.circular_dependencies,
    }


# Pydantic Schemas
class RepositoryImportRequest(BaseModel):
    repository_url: str  # Can be 'https://github.com/fastapi/fastapi', 'fastapi/fastapi', or 'sample:fastapi'
    custom_name: Optional[str] = None


class RepositoryResponse(BaseModel):
    id: uuid.UUID
    github_owner: str
    github_name: str
    clone_url: str
    default_branch: str
    last_indexed_commit_sha: Optional[str]
    status: str
    error_message: Optional[str]
    total_files: int
    total_chunks: int

    model_config = ConfigDict(from_attributes=True)


class FileSummaryResponse(BaseModel):
    id: uuid.UUID
    file_path: str
    language: str
    line_count: int
    byte_size: int

    model_config = ConfigDict(from_attributes=True)


class SymbolResponse(BaseModel):
    id: uuid.UUID
    name: str
    qualified_name: str
    kind: str
    signature: str
    docstring: Optional[str]
    start_line: int
    end_line: int
    file_path: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


async def run_indexing_task(repo_id: uuid.UUID) -> None:
    async with AsyncSessionLocal() as session:
        await RepositoryIndexingWorker.index_repository(session, repo_id)

        # Pre-compute and persist dependency graph right after indexing finishes
        stmt_repo = (
            select(Repository)
            .where(Repository.id == repo_id)
            .options(noload("*"))
        )
        res_repo = await session.execute(stmt_repo)
        repo = res_repo.scalar_one_or_none()
        if repo and repo.status == IndexingStatus.READY:
            stmt_files = select(RepositoryFile.file_path).where(
                RepositoryFile.repository_id == repo_id
            )
            res_files = await session.execute(stmt_files)
            file_paths = list(res_files.scalars().all())
            repo_dir = _get_repo_storage_dir(repo)
            graph_payload = await asyncio.to_thread(
                _compute_dependency_graph_sync, repo_dir, file_paths
            )
            updated_meta = dict(repo.metadata_json or {})
            updated_meta[DEPENDENCY_CACHE_VERSION] = graph_payload
            await session.execute(
                update(Repository)
                .where(Repository.id == repo_id)
                .values(metadata_json=updated_meta)
            )
            await session.commit()

            cache_key = (
                str(repo.id),
                repo.last_indexed_commit_sha or "",
                repo.total_files,
            )
            _DEPENDENCY_GRAPH_CACHE[cache_key] = graph_payload


@router.post("/import", response_model=RepositoryResponse, status_code=status.HTTP_202_ACCEPTED)
async def import_repository(
    payload: RepositoryImportRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    url_input = payload.repository_url.strip()

    if url_input == "sample:fastapi" or "sample" in url_input.lower():
        owner, name, clone_url = "sample", "fastapi-cloudflow", "sample:fastapi"
    else:
        try:
            owner, name, clone_url = GitRepositoryImporter.parse_repo_identifier(url_input)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

    # Check if already imported
    stmt = (
        select(Repository)
        .where(Repository.github_owner == owner, Repository.github_name == name)
        .options(noload("*"))
    )
    res = await db.execute(stmt)
    existing = res.scalar_one_or_none()
    if existing:
        # If previous indexing failed or user wants re-index, trigger again
        if existing.status in (IndexingStatus.FAILED, IndexingStatus.READY):
            existing.status = IndexingStatus.PENDING
            await db.commit()
            background_tasks.add_task(run_indexing_task, existing.id)
        return existing

    repo = Repository(
        id=uuid.uuid4(),
        github_owner=owner,
        github_name=name,
        clone_url=clone_url,
        default_branch="main",
        status=IndexingStatus.PENDING,
    )
    db.add(repo)
    await db.commit()
    await db.refresh(repo)

    # Queue indexing in background
    background_tasks.add_task(run_indexing_task, repo.id)
    return repo


@router.get("", response_model=List[RepositoryResponse])
async def list_repositories(db: AsyncSession = Depends(get_db)):
    stmt = (
        select(Repository)
        .options(noload("*"))
        .order_by(Repository.created_at.desc())
    )
    res = await db.execute(stmt)
    return res.scalars().all()


@router.get("/{repo_id}", response_model=RepositoryResponse)
async def get_repository(repo_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(Repository)
        .where(Repository.id == repo_id)
        .options(noload("*"))
    )
    res = await db.execute(stmt)
    repo = res.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    return repo


@router.delete("/{repo_id}", status_code=status.HTTP_200_OK)
async def delete_repository(repo_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """
    Deletes a repository workspace including all database child records,
    cloned files on disk, and in-memory dependency and progress caches.
    """
    stmt = (
        select(Repository)
        .where(Repository.id == repo_id)
        .options(noload("*"))
    )
    res = await db.execute(stmt)
    repo = res.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    repo_dir = _get_repo_storage_dir(repo)

    # 1. Database cascade cleanup across all child relations
    eval_run_ids_subq = select(EvaluationRun.id).where(
        EvaluationRun.repository_id == repo_id
    )
    await db.execute(
        delete(EvaluationSampleResult).where(
            EvaluationSampleResult.evaluation_run_id.in_(eval_run_ids_subq)
        )
    )
    await db.execute(
        delete(EvaluationRun).where(EvaluationRun.repository_id == repo_id)
    )

    conv_ids_subq = select(Conversation.id).where(
        Conversation.repository_id == repo_id
    )
    await db.execute(
        delete(Message).where(Message.conversation_id.in_(conv_ids_subq))
    )
    await db.execute(
        delete(Conversation).where(Conversation.repository_id == repo_id)
    )

    await db.execute(
        delete(ChunkEmbedding).where(ChunkEmbedding.repository_id == repo_id)
    )
    await db.execute(
        delete(CodeChunk).where(CodeChunk.repository_id == repo_id)
    )
    await db.execute(
        delete(ASTSymbol).where(ASTSymbol.repository_id == repo_id)
    )
    await db.execute(
        delete(RepositoryFile).where(RepositoryFile.repository_id == repo_id)
    )
    await db.execute(delete(Repository).where(Repository.id == repo_id))
    await db.commit()

    # 2. Evict in-memory caches
    repo_id_str = str(repo_id)
    stale_cache_keys = [
        key for key in _DEPENDENCY_GRAPH_CACHE if key[0] == repo_id_str
    ]
    for key in stale_cache_keys:
        _DEPENDENCY_GRAPH_CACHE.pop(key, None)

    IndexingProgressTracker.remove(repo_id)

    # 3. Remove cloned repository directory from disk
    await asyncio.to_thread(_remove_repo_storage_dir_sync, repo_dir)

    return {"status": "deleted", "id": repo_id_str}


@router.get("/{repo_id}/tree")
async def get_repository_tree(repo_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(
            RepositoryFile.id,
            RepositoryFile.file_path,
            RepositoryFile.language,
            RepositoryFile.line_count,
            RepositoryFile.byte_size,
        )
        .where(RepositoryFile.repository_id == repo_id)
        .order_by(RepositoryFile.file_path)
    )
    res = await db.execute(stmt)
    files = res.all()

    # Build hierarchical tree structure
    root: Dict[str, Any] = {"name": "root", "type": "directory", "children": []}

    for f_id, f_path, f_lang, f_lines, f_size in files:
        parts = f_path.split("/")
        curr = root
        for idx, part in enumerate(parts):
            is_file = idx == len(parts) - 1
            if is_file:
                curr["children"].append({
                    "name": part,
                    "type": "file",
                    "path": f_path,
                    "id": str(f_id),
                    "language": f_lang,
                    "lines": f_lines,
                    "size": f_size,
                })
            else:
                # Directory
                found = next(
                    (
                        c
                        for c in curr["children"]
                        if c["name"] == part and c["type"] == "directory"
                    ),
                    None,
                )
                if not found:
                    found = {"name": part, "type": "directory", "children": []}
                    curr["children"].append(found)
                curr = found

    return root


@router.get("/{repo_id}/files/{file_id}")
async def get_file_content(
    repo_id: uuid.UUID, file_id: uuid.UUID, db: AsyncSession = Depends(get_db)
):
    stmt = (
        select(RepositoryFile)
        .where(RepositoryFile.id == file_id, RepositoryFile.repository_id == repo_id)
        .options(
            noload(RepositoryFile.chunks),
            selectinload(RepositoryFile.symbols),
        )
    )
    res = await db.execute(stmt)
    file_obj = res.scalar_one_or_none()
    if not file_obj:
        raise HTTPException(status_code=404, detail="File not found")

    stmt_repo = (
        select(Repository)
        .where(Repository.id == repo_id)
        .options(noload("*"))
    )
    res_repo = await db.execute(stmt_repo)
    repo = res_repo.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    repo_dir = _get_repo_storage_dir(repo)
    disk_path = repo_dir / file_obj.file_path
    content = await asyncio.to_thread(_read_file_text_sync, disk_path)

    symbols_data = [
        {
            "id": s.id,
            "name": s.name,
            "kind": s.kind.value,
            "signature": s.signature,
            "start_line": s.start_line,
            "end_line": s.end_line,
        }
        for s in file_obj.symbols
    ]

    return {
        "id": file_obj.id,
        "file_path": file_obj.file_path,
        "language": file_obj.language,
        "line_count": file_obj.line_count,
        "content": content,
        "symbols": symbols_data,
    }


@router.get("/{repo_id}/symbols", response_model=List[SymbolResponse])
async def list_repository_symbols(
    repo_id: uuid.UUID,
    q: Optional[str] = Query(None, description="Symbol name filter"),
    kind: Optional[str] = Query(None, description="Symbol kind filter"),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(ASTSymbol, RepositoryFile.file_path)
        .join(RepositoryFile, ASTSymbol.file_id == RepositoryFile.id)
        .where(ASTSymbol.repository_id == repo_id)
    )
    if q:
        stmt = stmt.where(ASTSymbol.name.ilike(f"%{q}%"))
    if kind:
        stmt = stmt.where(ASTSymbol.kind == kind)

    stmt = stmt.limit(100)
    res = await db.execute(stmt)
    rows = res.all()

    symbols = []
    for s, f_path in rows:
        symbols.append(
            SymbolResponse(
                id=s.id,
                name=s.name,
                qualified_name=s.qualified_name,
                kind=s.kind.value,
                signature=s.signature,
                docstring=s.docstring,
                start_line=s.start_line,
                end_line=s.end_line,
                file_path=f_path,
            )
        )
    return symbols


@router.get("/{repo_id}/dependencies")
async def get_repository_dependencies(
    repo_id: uuid.UUID,
    refresh: bool = Query(False, description="Force recomputation of dependency graph"),
    db: AsyncSession = Depends(get_db),
):
    stmt_repo = (
        select(Repository)
        .where(Repository.id == repo_id)
        .options(noload("*"))
    )
    res_repo = await db.execute(stmt_repo)
    repo = res_repo.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    cache_key = (
        str(repo.id),
        repo.last_indexed_commit_sha or "",
        repo.total_files,
    )

    if not refresh:
        # 1. Fast path: In-memory cache (< 1ms)
        if cache_key in _DEPENDENCY_GRAPH_CACHE:
            return _DEPENDENCY_GRAPH_CACHE[cache_key]

        # 2. Persistent DB metadata cache (zero disk I/O)
        if repo.metadata_json and isinstance(
            repo.metadata_json.get(DEPENDENCY_CACHE_VERSION), dict
        ):
            cached_graph = repo.metadata_json[DEPENDENCY_CACHE_VERSION]
            _DEPENDENCY_GRAPH_CACHE[cache_key] = cached_graph
            return cached_graph

    # 3. Compute in background worker thread without blocking asyncio event loop
    stmt_files = select(RepositoryFile.file_path).where(
        RepositoryFile.repository_id == repo_id
    )
    res_files = await db.execute(stmt_files)
    file_paths = list(res_files.scalars().all())

    repo_dir = _get_repo_storage_dir(repo)
    graph_payload = await asyncio.to_thread(
        _compute_dependency_graph_sync, repo_dir, file_paths
    )

    # Persist into Repository.metadata_json without triggering relationship cascades
    updated_meta = dict(repo.metadata_json or {})
    updated_meta[DEPENDENCY_CACHE_VERSION] = graph_payload
    await db.execute(
        update(Repository)
        .where(Repository.id == repo_id)
        .values(metadata_json=updated_meta)
    )
    await db.commit()

    _DEPENDENCY_GRAPH_CACHE[cache_key] = graph_payload
    return graph_payload


@router.get("/{repo_id}/progress-stream")
async def stream_repository_indexing_progress(
    repo_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """
    Server-Sent Events (SSE) streaming real-time indexing status,
    active stage, current file, and completion percentage.
    """
    stmt = select(Repository).where(Repository.id == repo_id).options(noload("*"))
    res = await db.execute(stmt)
    repo = res.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    async def event_generator():
        # If repo is already ready or failed in DB
        if repo.status == IndexingStatus.READY:
            yield f"data: {json.dumps({'stage': 'ready', 'pct': 100, 'current_file': 'Index ready', 'files_processed': repo.total_files, 'total_files': repo.total_files, 'chunks_count': repo.total_chunks, 'total_chunks': repo.total_chunks})}\n\n"
            return
        if repo.status == IndexingStatus.FAILED:
            yield f"data: {json.dumps({'stage': 'failed', 'pct': 0, 'error': repo.error_message or 'Indexing failed'})}\n\n"
            return

        for _ in range(300):
            progress = IndexingProgressTracker.get(repo_id)
            payload = {
                "stage": progress.stage,
                "pct": progress.pct,
                "current_file": progress.current_file,
                "files_processed": progress.files_processed,
                "total_files": progress.total_files,
                "chunks_count": progress.chunks_count,
                "total_chunks": progress.total_chunks,
                "error": progress.error,
            }
            yield f"data: {json.dumps(payload)}\n\n"

            if progress.stage in ("ready", "failed"):
                break
            await asyncio.sleep(0.4)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
