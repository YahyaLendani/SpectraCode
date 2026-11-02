from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class IndexingStatus(str, enum.Enum):
    PENDING = "pending"
    CLONING = "cloning"
    PARSING_AST = "parsing_ast"
    EMBEDDING = "embedding"
    READY = "ready"
    FAILED = "failed"


class SymbolKind(str, enum.Enum):
    MODULE = "module"
    CLASS = "class"
    CLASS_HEADER = "class_header"
    INTERFACE = "interface"
    TYPE_ALIAS = "type_alias"
    FUNCTION = "function"
    METHOD = "method"
    VARIABLE = "variable"


class MessageRole(str, enum.Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Repository(Base):
    __tablename__ = "repositories"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    github_owner: Mapped[str] = mapped_column(String(128), nullable=False)
    github_name: Mapped[str] = mapped_column(String(128), nullable=False)
    clone_url: Mapped[str] = mapped_column(String(512), nullable=False)
    default_branch: Mapped[str] = mapped_column(String(128), nullable=False, default="main")
    last_indexed_commit_sha: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    status: Mapped[IndexingStatus] = mapped_column(
        Enum(IndexingStatus, name="indexing_status_enum", native_enum=False),
        nullable=False,
        default=IndexingStatus.PENDING,
    )
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    total_files: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_chunks: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    metadata_json: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    files: Mapped[List["RepositoryFile"]] = relationship(
        back_populates="repository", cascade="all, delete-orphan", lazy="selectin"
    )
    chunks: Mapped[List["CodeChunk"]] = relationship(
        back_populates="repository", cascade="all, delete-orphan", lazy="selectin"
    )
    conversations: Mapped[List["Conversation"]] = relationship(
        back_populates="repository", cascade="all, delete-orphan", lazy="selectin"
    )
    evaluation_runs: Mapped[List["EvaluationRun"]] = relationship(
        back_populates="repository", cascade="all, delete-orphan", lazy="selectin"
    )

    __table_args__ = (
        UniqueConstraint("github_owner", "github_name", name="uq_repo_owner_name"),
        Index("ix_repositories_status", "status"),
    )


class RepositoryFile(Base):
    __tablename__ = "repository_files"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    repository_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False
    )
    file_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    language: Mapped[str] = mapped_column(String(32), nullable=False)
    blob_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    line_count: Mapped[int] = mapped_column(Integer, nullable=False)
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False)
    imports_list: Mapped[List[str]] = mapped_column(JSON, nullable=False, default=list)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    repository: Mapped["Repository"] = relationship(back_populates="files")
    symbols: Mapped[List["ASTSymbol"]] = relationship(
        back_populates="file", cascade="all, delete-orphan", lazy="selectin"
    )
    chunks: Mapped[List["CodeChunk"]] = relationship(
        back_populates="file", cascade="all, delete-orphan", lazy="selectin"
    )

    __table_args__ = (
        UniqueConstraint("repository_id", "file_path", name="uq_repo_file_path"),
        Index("ix_repo_files_repo_lang", "repository_id", "language"),
    )


class ASTSymbol(Base):
    __tablename__ = "ast_symbols"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    repository_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False
    )
    file_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("repository_files.id", ondelete="CASCADE"), nullable=False
    )
    parent_symbol_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("ast_symbols.id", ondelete="SET NULL"), nullable=True
    )

    name: Mapped[str] = mapped_column(String(256), nullable=False)
    qualified_name: Mapped[str] = mapped_column(String(512), nullable=False)
    kind: Mapped[SymbolKind] = mapped_column(
        Enum(SymbolKind, name="symbol_kind_enum", native_enum=False), nullable=False
    )
    signature: Mapped[str] = mapped_column(Text, nullable=False)
    docstring: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    start_line: Mapped[int] = mapped_column(Integer, nullable=False)
    end_line: Mapped[int] = mapped_column(Integer, nullable=False)
    start_byte: Mapped[int] = mapped_column(Integer, nullable=False)
    end_byte: Mapped[int] = mapped_column(Integer, nullable=False)

    file: Mapped["RepositoryFile"] = relationship(back_populates="symbols")
    parent_symbol: Mapped[Optional["ASTSymbol"]] = relationship(
        remote_side=[id], backref="child_symbols"
    )
    chunks: Mapped[List["CodeChunk"]] = relationship(back_populates="symbol")

    __table_args__ = (
        Index("ix_ast_symbols_repo_name", "repository_id", "name"),
        Index("ix_ast_symbols_file_lines", "file_id", "start_line", "end_line"),
    )


class CodeChunk(Base):
    __tablename__ = "code_chunks"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    repository_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False
    )
    file_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("repository_files.id", ondelete="CASCADE"), nullable=False
    )
    symbol_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("ast_symbols.id", ondelete="SET NULL"), nullable=True
    )

    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    start_line: Mapped[int] = mapped_column(Integer, nullable=False)
    end_line: Mapped[int] = mapped_column(Integer, nullable=False)

    raw_code: Mapped[str] = mapped_column(Text, nullable=False)
    contextualized_text: Mapped[str] = mapped_column(Text, nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    token_count: Mapped[int] = mapped_column(Integer, nullable=False)
    lexical_tokens: Mapped[str] = mapped_column(Text, nullable=False, default="")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    repository: Mapped["Repository"] = relationship(back_populates="chunks")
    file: Mapped["RepositoryFile"] = relationship(back_populates="chunks")
    symbol: Mapped[Optional["ASTSymbol"]] = relationship(back_populates="chunks")
    embedding: Mapped[Optional["ChunkEmbedding"]] = relationship(
        back_populates="chunk", uselist=False, cascade="all, delete-orphan", lazy="selectin"
    )

    __table_args__ = (
        UniqueConstraint("file_id", "chunk_index", name="uq_file_chunk_idx"),
        Index("ix_code_chunks_repo_lines", "repository_id", "file_id", "start_line", "end_line"),
    )


class ChunkEmbedding(Base):
    __tablename__ = "chunk_embeddings"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    chunk_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("code_chunks.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    repository_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False
    )
    model_name: Mapped[str] = mapped_column(String(128), nullable=False, default="BAAI/bge-small-en-v1.5")
    dimensions: Mapped[int] = mapped_column(Integer, nullable=False, default=384)
    embedding_vector: Mapped[List[float]] = mapped_column(JSON, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    chunk: Mapped["CodeChunk"] = relationship(back_populates="embedding")

    __table_args__ = (
        Index("ix_chunk_embeddings_repo", "repository_id"),
    )


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    repository_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(256), nullable=False, default="New Conversation")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    repository: Mapped["Repository"] = relationship(back_populates="conversations")
    messages: Mapped[List["Message"]] = relationship(
        back_populates="conversation", order_by="Message.created_at", cascade="all, delete-orphan", lazy="selectin"
    )


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[MessageRole] = mapped_column(
        Enum(MessageRole, name="message_role_enum", native_enum=False), nullable=False
    )
    content_markdown: Mapped[str] = mapped_column(Text, nullable=False)

    verified_citations: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    rejected_citations: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    retrieved_chunk_ids: Mapped[List[str]] = mapped_column(JSON, nullable=False, default=list)
    is_abstained: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    latency_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    conversation: Mapped["Conversation"] = relationship(back_populates="messages")

    __table_args__ = (
        Index("ix_messages_conversation_created", "conversation_id", "created_at"),
    )


class EvaluationRun(Base):
    __tablename__ = "evaluation_runs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    repository_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False
    )
    benchmark_name: Mapped[str] = mapped_column(String(128), nullable=False)
    commit_sha: Mapped[str] = mapped_column(String(64), nullable=False, default="main")
    config_snapshot: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    mean_recall_at_k: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    mean_mrr: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    mean_citation_precision: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    mean_citation_recall: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    mean_citation_f1: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    mean_faithfulness: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    repository: Mapped["Repository"] = relationship(back_populates="evaluation_runs")
    sample_results: Mapped[List["EvaluationSampleResult"]] = relationship(
        back_populates="evaluation_run", cascade="all, delete-orphan", lazy="selectin"
    )


class EvaluationSampleResult(Base):
    __tablename__ = "evaluation_sample_results"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    evaluation_run_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("evaluation_runs.id", ondelete="CASCADE"), nullable=False
    )
    sample_key: Mapped[str] = mapped_column(String(128), nullable=False)
    query: Mapped[str] = mapped_column(Text, nullable=False)
    ground_truth_spans: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, nullable=False)
    retrieved_spans: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, nullable=False)
    emitted_citations: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, nullable=False)
    generated_answer: Mapped[str] = mapped_column(Text, nullable=False)

    recall_at_k: Mapped[float] = mapped_column(Float, nullable=False)
    reciprocal_rank: Mapped[float] = mapped_column(Float, nullable=False)
    citation_precision: Mapped[float] = mapped_column(Float, nullable=False)
    citation_recall: Mapped[float] = mapped_column(Float, nullable=False)
    citation_f1: Mapped[float] = mapped_column(Float, nullable=False)
    faithfulness: Mapped[float] = mapped_column(Float, nullable=False)

    evaluation_run: Mapped["EvaluationRun"] = relationship(back_populates="sample_results")

