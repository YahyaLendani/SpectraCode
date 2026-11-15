from __future__ import annotations

import os
from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "SpectraCode"
    API_V1_STR: str = "/api/v1"

    # Storage and Base Paths
    BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent
    DATA_DIR: Path = BASE_DIR / "data"
    REPOS_STORAGE_DIR: Path = DATA_DIR / "repos"

    # Database (preserves existing local repolens.db if present, else spectracode.db)
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        f"sqlite+aiosqlite:///{BASE_DIR / ('repolens.db' if (BASE_DIR / 'repolens.db').exists() else 'spectracode.db')}",
    )

    # Embeddings & Retrieval
    EMBEDDING_PROVIDER: str = "fastembed"  # "fastembed" | "openai" | "voyage"
    EMBEDDING_MODEL: str = "BAAI/bge-small-en-v1.5"
    EMBEDDING_DIM: int = 384

    # Chunking
    MAX_CHUNK_CHARS: int = 3000
    MIN_CHUNK_CHARS: int = 100
    OVERLAP_LINES: int = 4

    # Import limits: a repository over any of these fails with a clear message instead of
    # filling the disk or tying up the indexing worker. Defaults come from measured local
    # throughput (~5 chunks/s embedding on CPU), so MAX_CHUNKS is roughly 15-20 minutes.
    MAX_CHECKOUT_MB: float = 250
    MAX_INDEXED_FILES: int = 3000
    MAX_CHUNKS: int = 5000
    INDEXING_TIMEOUT_SECONDS: float = 1800

    # RAG & Citations
    MIN_RELEVANCE_SCORE: float = 0.18
    DEFAULT_TOP_K: int = 8

    # LLM Settings
    # "gemini" calls Gemini when GEMINI_API_KEY is set; "template" always uses the built-in
    # extractive generator. Keys are read from the environment or backend/.env.
    LLM_PROVIDER: str = "gemini"
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"
    OPENAI_API_KEY: str = ""

    # Logging
    LOG_LEVEL: str = "INFO"

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()

# Ensure directories exist
settings.DATA_DIR.mkdir(parents=True, exist_ok=True)
settings.REPOS_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
