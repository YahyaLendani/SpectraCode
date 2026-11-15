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
        f"sqlite+aiosqlite:///{BASE_DIR / ('repolens.db' if (BASE_DIR / 'repolens.db').exists() else 'spectracode.db')}"
    )
    
    # Embeddings & Retrieval
    EMBEDDING_PROVIDER: str = "fastembed"  # "fastembed" | "openai" | "voyage"
    EMBEDDING_MODEL: str = "BAAI/bge-small-en-v1.5"
    EMBEDDING_DIM: int = 384
    
    # Chunking
    MAX_CHUNK_CHARS: int = 3000
    MIN_CHUNK_CHARS: int = 100
    OVERLAP_LINES: int = 4
    
    # RAG & Citations
    MIN_RELEVANCE_SCORE: float = 0.18
    DEFAULT_TOP_K: int = 8
    
    # LLM Settings
    LLM_PROVIDER: str = "gemini"  # "gemini" | "openai" | "mock"
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    
    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()

# Ensure directories exist
settings.DATA_DIR.mkdir(parents=True, exist_ok=True)
settings.REPOS_STORAGE_DIR.mkdir(parents=True, exist_ok=True)

