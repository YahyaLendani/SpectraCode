from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any, Dict, List, Optional
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, HttpUrl
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.db.models import ASTSymbol, IndexingStatus, Repository, RepositoryFile
from app.db.session import AsyncSessionLocal, get_db
from app.ingestion.dependency_analyzer import CodebaseDependencyAnalyzer, CodebaseDependencyGraph
from app.ingestion.git_importer import GitRepositoryImporter
from app.ingestion.worker import RepositoryIndexingWorker

router = APIRouter(prefix="/repositories", tags=["Repositories"])


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


async def run_indexing_task(repo_id: uuid.UUID):
    async with AsyncSessionLocal() as session:
        await RepositoryIndexingWorker.index_repository(session, repo_id)


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
            raise HTTPException(status_code=400, detail=str(e))

    # Check if already imported
    stmt = select(Repository).where(
        Repository.github_owner == owner, Repository.github_name == name
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
    stmt = select(Repository).order_by(Repository.created_at.desc())
    res = await db.execute(stmt)
    return res.scalars().all()


@router.get("/{repo_id}", response_model=RepositoryResponse)
async def get_repository(repo_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    stmt = select(Repository).where(Repository.id == repo_id)
    res = await db.execute(stmt)
    repo = res.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    return repo


@router.get("/{repo_id}/tree")
async def get_repository_tree(repo_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    stmt = select(RepositoryFile).where(RepositoryFile.repository_id == repo_id).order_by(RepositoryFile.file_path)
    res = await db.execute(stmt)
    files = res.scalars().all()

    # Build hierarchical tree structure
    root: Dict[str, Any] = {"name": "root", "type": "directory", "children": []}

    for f in files:
        parts = f.file_path.split("/")
        curr = root
        for idx, part in enumerate(parts):
            is_file = idx == len(parts) - 1
            if is_file:
                curr["children"].append({
                    "name": part,
                    "type": "file",
                    "path": f.file_path,
                    "id": str(f.id),
                    "language": f.language,
                    "lines": f.line_count,
                    "size": f.byte_size,
                })
            else:
                # Directory
                found = next((c for c in curr["children"] if c["name"] == part and c["type"] == "directory"), None)
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
        .options(selectinload(RepositoryFile.symbols))
    )
    res = await db.execute(stmt)
    file_obj = res.scalar_one_or_none()
    if not file_obj:
        raise HTTPException(status_code=404, detail="File not found")

    # Read content from disk
    repo = await db.get(Repository, repo_id)
    repo_dir = settings.REPOS_STORAGE_DIR / f"{repo.github_owner}_{repo.github_name}_{repo.id.hex[:8]}"
    disk_path = repo_dir / file_obj.file_path

    content = ""
    if disk_path.exists():
        content = disk_path.read_text(encoding="utf-8", errors="replace")

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
    repo_id: uuid.UUID, db: AsyncSession = Depends(get_db)
):
    repo = await db.get(Repository, repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    repo_dir = settings.REPOS_STORAGE_DIR / f"{repo.github_owner}_{repo.github_name}_{repo.id.hex[:8]}"

    stmt = select(RepositoryFile).where(RepositoryFile.repository_id == repo_id)
    res = await db.execute(stmt)
    files = res.scalars().all()

    files_dict: Dict[str, str] = {}
    for f in files:
        disk_path = repo_dir / f.file_path
        if disk_path.exists():
            files_dict[f.file_path] = disk_path.read_text(encoding="utf-8", errors="replace")

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
