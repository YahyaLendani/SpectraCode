from __future__ import annotations

import asyncio
import hashlib
import itertools
import shutil
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.models import (
    ASTSymbol,
    ChunkEmbedding,
    CodeChunk,
    IndexingStatus,
    Repository,
    RepositoryFile,
    SymbolKind,
)
from app.ingestion.ast_chunker import CodeASTChunker
from app.ingestion.git_importer import (
    GitRepositoryImporter,
    RepositoryLimitError,
    SampleRepositoryFactory,
)
from app.retrieval.embeddings import EmbeddingService


@dataclass
class ProgressState:
    stage: str = "pending"
    files_processed: int = 0
    total_files: int = 0
    chunks_count: int = 0
    total_chunks: int = 0
    current_file: Optional[str] = None
    pct: int = 0
    error: Optional[str] = None


class IndexingProgressTracker:
    _instances: Dict[uuid.UUID, ProgressState] = {}

    @classmethod
    def get(cls, repo_id: uuid.UUID) -> ProgressState:
        if repo_id not in cls._instances:
            cls._instances[repo_id] = ProgressState()
        return cls._instances[repo_id]

    @classmethod
    def update(cls, repo_id: uuid.UUID, **kwargs: Any) -> None:
        state = cls.get(repo_id)
        for k, v in kwargs.items():
            setattr(state, k, v)

    @classmethod
    def remove(cls, repo_id: uuid.UUID) -> None:
        cls._instances.pop(repo_id, None)


class RepositoryIndexingWorker:
    """
    Coordinates asynchronous end-to-end repository indexing:
    git clone -> AST parsing -> semantic chunking -> vector embeddings -> database upsert.
    """

    @classmethod
    async def index_repository(
        cls,
        session: AsyncSession,
        repository_id: uuid.UUID,
        repo_dir: Optional[Path] = None,
    ) -> None:
        # 1. Fetch Repository Record
        stmt = select(Repository).where(Repository.id == repository_id)
        res = await session.execute(stmt)
        repo = res.scalar_one_or_none()
        if not repo:
            return

        try:
            # 2. Cloning / Locating Stage
            repo.status = IndexingStatus.CLONING
            await session.commit()
            IndexingProgressTracker.update(
                repo.id,
                stage="cloning",
                pct=10,
                current_file="Cloning repository git tree...",
            )

            if repo_dir is None:
                repo_dir = settings.REPOS_STORAGE_DIR / f"{repo.github_owner}_{repo.github_name}_{repo.id.hex[:8]}"

                if repo.clone_url.startswith("sample:"):
                    SampleRepositoryFactory.create_fastapi_sample(repo_dir)
                    commit_sha = "sample-commit-v1"
                else:
                    commit_sha = await asyncio.to_thread(
                        GitRepositoryImporter.clone_repository,
                        repo.clone_url,
                        repo_dir,
                    )
                    try:
                        GitRepositoryImporter.enforce_checkout_size(repo_dir)
                    except RepositoryLimitError:
                        # We created this checkout; don't leave an oversized one on disk.
                        shutil.rmtree(repo_dir, ignore_errors=True)
                        raise
                repo.last_indexed_commit_sha = commit_sha

            # 3. AST Parsing & Chunking Stage (with idempotent cleanup of existing records)
            repo.status = IndexingStatus.PARSING_AST
            await session.execute(delete(ChunkEmbedding).where(ChunkEmbedding.repository_id == repo.id))
            await session.execute(delete(CodeChunk).where(CodeChunk.repository_id == repo.id))
            await session.execute(delete(ASTSymbol).where(ASTSymbol.repository_id == repo.id))
            await session.execute(delete(RepositoryFile).where(RepositoryFile.repository_id == repo.id))
            await session.commit()

            IndexingProgressTracker.update(
                repo.id,
                stage="parsing_ast",
                pct=25,
                current_file="Scanning directory tree for AST analysis...",
            )

            chunker = CodeASTChunker(
                max_chunk_chars=settings.MAX_CHUNK_CHARS,
                min_chunk_chars=settings.MIN_CHUNK_CHARS,
                overlap_lines=settings.OVERLAP_LINES,
            )

            # islice stops the scan (and its in-memory file contents) one file past the limit.
            discovered_files = list(
                itertools.islice(GitRepositoryImporter.scan_files(repo_dir), settings.MAX_INDEXED_FILES + 1)
            )
            if len(discovered_files) > settings.MAX_INDEXED_FILES:
                raise RepositoryLimitError(
                    f"Repository has more than {settings.MAX_INDEXED_FILES} indexable files; "
                    f"the limit is {settings.MAX_INDEXED_FILES}."
                )
            repo.total_files = len(discovered_files)

            all_chunks_payloads = []
            all_db_chunks = []
            all_db_symbols = []
            all_db_files = []

            for f_idx, df in enumerate(discovered_files, start=1):
                IndexingProgressTracker.update(
                    repo.id,
                    stage="parsing_ast",
                    files_processed=f_idx,
                    total_files=len(discovered_files),
                    current_file=df.relative_path,
                    pct=25 + int(35 * f_idx / max(1, len(discovered_files))),
                )
                file_id = uuid.uuid4()
                sha = hashlib.sha256(df.content.encode("utf-8")).hexdigest()

                symbols, chunks = chunker.parse_and_chunk(df.relative_path, df.content)

                db_file = RepositoryFile(
                    id=file_id,
                    repository_id=repo.id,
                    file_path=df.relative_path,
                    language=df.language,
                    blob_sha256=sha,
                    line_count=df.line_count,
                    byte_size=df.size_bytes,
                    imports_list=[s.name for s in symbols if s.kind == "import"],
                )
                all_db_files.append(db_file)

                # Map symbol names to IDs
                sym_id_map = {}
                for sym in symbols:
                    sym_id = uuid.uuid4()
                    sym_id_map[sym.name] = sym_id
                    try:
                        kind_enum = SymbolKind(sym.kind)
                    except ValueError:
                        kind_enum = SymbolKind.FUNCTION

                    all_db_symbols.append(
                        ASTSymbol(
                            id=sym_id,
                            repository_id=repo.id,
                            file_id=file_id,
                            name=sym.name,
                            qualified_name=f"{sym.parent_scope}.{sym.name}" if sym.parent_scope else sym.name,
                            kind=kind_enum,
                            signature=sym.signature,
                            docstring=sym.docstring,
                            start_line=sym.start_line,
                            end_line=sym.end_line,
                            start_byte=sym.start_byte,
                            end_byte=sym.end_byte,
                        )
                    )

                for ch in chunks:
                    chunk_id = uuid.uuid4()
                    sym_id = sym_id_map.get(ch.symbol_name) if ch.symbol_name else None
                    db_chunk = CodeChunk(
                        id=chunk_id,
                        repository_id=repo.id,
                        file_id=file_id,
                        symbol_id=sym_id,
                        chunk_index=ch.chunk_index,
                        start_line=ch.start_line,
                        end_line=ch.end_line,
                        raw_code=ch.raw_code,
                        contextualized_text=ch.contextualized_text,
                        content_hash=ch.content_hash,
                        token_count=ch.token_estimate,
                        lexical_tokens=ch.lexical_tokens,
                    )
                    all_db_chunks.append(db_chunk)
                    all_chunks_payloads.append((chunk_id, ch.contextualized_text))

            if len(all_db_chunks) > settings.MAX_CHUNKS:
                raise RepositoryLimitError(
                    f"Repository produces {len(all_db_chunks)} code chunks; the limit is {settings.MAX_CHUNKS}."
                )
            repo.total_chunks = len(all_db_chunks)

            # Persist files, symbols, chunks
            session.add_all(all_db_files)
            session.add_all(all_db_symbols)
            session.add_all(all_db_chunks)
            await session.commit()

            # 4. Dense Vector Embedding Stage
            repo.status = IndexingStatus.EMBEDDING
            await session.commit()
            IndexingProgressTracker.update(
                repo.id,
                stage="embedding",
                pct=60,
                current_file="Preparing ONNX vector embeddings...",
            )

            if all_chunks_payloads:
                batch_size = 32
                texts_to_embed = [p[1] for p in all_chunks_payloads]
                embeddings_list = []

                for i in range(0, len(texts_to_embed), batch_size):
                    batch_texts = texts_to_embed[i : i + batch_size]
                    batch_vectors = await EmbeddingService.embed_texts(batch_texts)
                    embeddings_list.extend(batch_vectors)
                    chunks_done = min(i + len(batch_texts), len(texts_to_embed))
                    IndexingProgressTracker.update(
                        repo.id,
                        stage="embedding",
                        chunks_count=chunks_done,
                        total_chunks=len(texts_to_embed),
                        current_file=f"Computing 384-d embeddings ({chunks_done}/{len(texts_to_embed)} chunks)...",
                        pct=60 + int(35 * chunks_done / max(1, len(texts_to_embed))),
                    )

                all_db_embeddings = []
                for (chunk_id, _), vec in zip(all_chunks_payloads, embeddings_list, strict=True):
                    all_db_embeddings.append(
                        ChunkEmbedding(
                            id=uuid.uuid4(),
                            chunk_id=chunk_id,
                            repository_id=repo.id,
                            model_name=settings.EMBEDDING_MODEL,
                            dimensions=len(vec),
                            embedding_vector=vec,
                        )
                    )
                session.add_all(all_db_embeddings)
                await session.commit()

            # 5. Finished & Ready
            repo.status = IndexingStatus.READY
            repo.error_message = None
            await session.commit()
            IndexingProgressTracker.update(
                repo.id,
                stage="ready",
                pct=100,
                current_file="Indexing completed successfully.",
                files_processed=repo.total_files,
                total_files=repo.total_files,
                chunks_count=repo.total_chunks,
                total_chunks=repo.total_chunks,
            )

        except Exception as exc:
            repo.status = IndexingStatus.FAILED
            repo.error_message = str(exc)
            await session.commit()
            IndexingProgressTracker.update(
                repo.id,
                stage="failed",
                pct=0,
                error=str(exc),
            )
            raise

