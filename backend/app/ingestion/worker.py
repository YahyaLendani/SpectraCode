from __future__ import annotations

import asyncio
import hashlib
from pathlib import Path
from typing import List, Optional
import uuid

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
from app.ingestion.ast_chunker import CodeASTChunker, ExtractedSymbol
from app.ingestion.git_importer import GitRepositoryImporter, SampleRepositoryFactory
from app.retrieval.embeddings import EmbeddingService


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
                repo.last_indexed_commit_sha = commit_sha

            # 3. AST Parsing & Chunking Stage (with idempotent cleanup of existing records)
            repo.status = IndexingStatus.PARSING_AST
            await session.execute(delete(ChunkEmbedding).where(ChunkEmbedding.repository_id == repo.id))
            await session.execute(delete(CodeChunk).where(CodeChunk.repository_id == repo.id))
            await session.execute(delete(ASTSymbol).where(ASTSymbol.repository_id == repo.id))
            await session.execute(delete(RepositoryFile).where(RepositoryFile.repository_id == repo.id))
            await session.commit()

            chunker = CodeASTChunker(
                max_chunk_chars=settings.MAX_CHUNK_CHARS,
                min_chunk_chars=settings.MIN_CHUNK_CHARS,
                overlap_lines=settings.OVERLAP_LINES,
            )

            discovered_files = list(GitRepositoryImporter.scan_files(repo_dir))
            repo.total_files = len(discovered_files)

            all_chunks_payloads = []
            all_db_chunks = []
            all_db_symbols = []
            all_db_files = []

            for df in discovered_files:
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

            repo.total_chunks = len(all_db_chunks)

            # Persist files, symbols, chunks
            session.add_all(all_db_files)
            session.add_all(all_db_symbols)
            session.add_all(all_db_chunks)
            await session.commit()

            # 4. Dense Vector Embedding Stage
            repo.status = IndexingStatus.EMBEDDING
            await session.commit()

            if all_chunks_payloads:
                batch_size = 32
                texts_to_embed = [p[1] for p in all_chunks_payloads]
                embeddings_list = []

                for i in range(0, len(texts_to_embed), batch_size):
                    batch_texts = texts_to_embed[i : i + batch_size]
                    batch_vectors = await EmbeddingService.embed_texts(batch_texts)
                    embeddings_list.extend(batch_vectors)

                all_db_embeddings = []
                for (chunk_id, _), vec in zip(all_chunks_payloads, embeddings_list):
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

        except Exception as exc:
            repo.status = IndexingStatus.FAILED
            repo.error_message = str(exc)
            await session.commit()
            raise

